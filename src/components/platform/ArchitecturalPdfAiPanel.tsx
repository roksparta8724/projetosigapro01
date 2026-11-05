import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backendClient } from "@/integrations/backend/databaseClient";
import { makeReviewedDrawingEvidence, type DrawingExtraction } from "@/lib/architecturalPdfReadings";
import { URBAN_METRICS, type UrbanMetric } from "@/lib/urbanPrecheck";
import type { ProcessRecord } from "@/lib/platform";

type Prepared = Partial<Record<UrbanMetric,{value:string;evidence:string}>>;
type ReadingMode = "visual" | "cloudflare_text";
type ApiResult = DrawingExtraction & {
  processId:string; documentId:string; documentVersion:number; fileName:string;
  legalConformity:"not_evaluated"; humanReviewRequired:true;
  aiProvider:"cloudflare"|"claude"|"openai";
};
const normalized = (value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

export function ArchitecturalPdfAiPanel({
  process,readOnly,activeMetrics,onApply,
}:{
  process:ProcessRecord; readOnly:boolean; activeMetrics:readonly UrbanMetric[];
  onApply:(reviewed:Prepared)=>void;
}) {
  const plans=useMemo(()=>process.documents.filter(doc=>
    doc.uploaded && Boolean(doc.filePath) &&
    /\.pdf$/i.test(doc.fileName||"") &&
    /projeto arquitetonico/.test(normalized(doc.label))
  ).sort((a,b)=>b.version-a.version),[process.documents]);
  const [id,setId]=useState("");
  const [consent,setConsent]=useState(false);
  const [readingMode,setReadingMode]=useState<ReadingMode>("visual");
  const [billingUnavailable,setBillingUnavailable]=useState(false);
  const [loading,setLoading]=useState(false);
  const [availability,setAvailability]=useState<{
    status:"checking"|"ready"|"disabled";message:string;
    provider:"cloudflare"|"claude"|"openai"|"none";
    mode:"visual"|"text_only"|"disabled";
    documentReady:boolean|null;
    documentMessage:string;
    textAlternativeAvailable:boolean;
  }>({status:"checking",message:"Verificando se o provedor de IA está configurado...",
    provider:"none",mode:"disabled",documentReady:null,documentMessage:"",
    textAlternativeAvailable:false});

  const [error,setError]=useState("");
  const [draft,setDraft]=useState<ApiResult|null>(null);
  const [checked,setChecked]=useState<Partial<Record<UrbanMetric,boolean>>>({});
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    setId(plans[0]?.id||"");setConsent(false);setReadingMode("visual");
    setBillingUnavailable(false);setDraft(null);setChecked({});setError("");setNotice("");
  },[process.id,plans[0]?.id]);

  useEffect(()=>{
    let current=true;
    if(readOnly){
      setAvailability({status:"disabled",provider:"none",mode:"disabled",
        documentReady:null,documentMessage:"",textAlternativeAvailable:false,
        message:"A leitura assistida está disponível apenas para o analista autorizado."});
      return;
    }
    setAvailability({status:"checking",provider:"none",mode:"disabled",
      documentReady:null,documentMessage:"",textAlternativeAvailable:false,
      message:"Verificando provedor e liberação técnica do PDF na homologação..."});
    void (async()=>{
      const session=(await backendClient.auth.getSession()).data?.session;
      const jwt=session?.access_token||session?.accessToken||session?.token||"";
      if(!jwt)throw new Error("Sessão expirada. Entre novamente no SIGAPRO.");
      const selectedDocumentId=id||plans[0]?.id||"";
      const query=new URLSearchParams({action:"project-extract"});
      if(selectedDocumentId){
        query.set("processId",process.id);
        query.set("documentId",selectedDocumentId);
      }
      const res=await fetch("/api/ai-assistant?"+query.toString(),{
        method:"GET",cache:"no-store",headers:{Authorization:"Bearer "+jwt},
      });
      const value=await res.json() as {
        enabled?:boolean;provider?:string;mode?:string;message?:string;error?:string;
        documentReady?:boolean|null;documentMessage?:string;
        textAlternativeAvailable?:boolean;
      };
      if(!res.ok)throw new Error(value.error||"Não foi possível confirmar a disponibilidade da IA.");
      if(current)setAvailability({status:value.enabled?"ready":"disabled",
        provider:value.provider==="cloudflare"||value.provider==="claude"||value.provider==="openai"
          ?value.provider:"none",
        mode:value.mode==="visual"||value.mode==="text_only"?value.mode:"disabled",
        documentReady:typeof value.documentReady==="boolean"?value.documentReady:null,
        documentMessage:value.documentMessage||"",
        textAlternativeAvailable:value.textAlternativeAvailable===true,
        message:value.message||"Leitor assistido indisponível."});
    })().catch((err:unknown)=>{
      if(current)setAvailability({status:"disabled",provider:"none",mode:"disabled",
        documentReady:null,documentMessage:"",textAlternativeAvailable:false,
        message:String((err as Error)?.message||err)});
    });
    return()=>{current=false;};
  },[process.id,readOnly,id,plans]);

  const selected=plans.find(doc=>doc.id===id);
  const latest=plans[0]?.id===id;
  const readyForSelectedMode=readingMode==="cloudflare_text"
    ?availability.textAlternativeAvailable
    :availability.status==="ready"&&availability.mode==="visual";
  const changeReadingMode=(next:ReadingMode)=>{
    if(readOnly||loading||next===readingMode)return;
    setReadingMode(next);setConsent(false);setDraft(null);
    setChecked({});setError("");setNotice("");
  };
  const applied=draft?.readings.filter(row=>
    row.usableForReview && checked[row.metric] &&
    activeMetrics.includes(row.metric))||[];
  async function scan(){
    if(readOnly||!selected||!latest||!consent||loading||
      !readyForSelectedMode||availability.documentReady!==true)return;
    setDraft(null);setChecked({});setError("");setNotice("");setLoading(true);
    try{
      const session=(await backendClient.auth.getSession()).data?.session;
      const jwt=session?.access_token||session?.accessToken||session?.token||"";
      if(!jwt)throw new Error("Sessão expirada. Entre novamente no SIGAPRO.");
      const response=await fetch("/api/ai-assistant?action=project-extract",{
        method:"POST",cache:"no-store",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+jwt},
        body:JSON.stringify({processId:process.id,documentId:selected.id,
          confirmedTransfer:true,readingMode}),
      });
      const result=await response.json() as Partial<ApiResult>&{error?:string;code?:string};
      if(!response.ok){
        if(result.code==="AI_PROVIDER_BILLING")setBillingUnavailable(true);
        throw new Error(result.error||"Não foi possível ler o projeto.");
      }
      if(result.processId!==process.id||result.documentId!==selected.id||
        result.documentVersion!==selected.version||
        !Array.isArray(result.readings)||!["ai_pdf_visual","ai_pdf_text"].includes(result.source)||
        result.automaticallyApproved!==false||result.legalConformity!=="not_evaluated"||
        (readingMode==="cloudflare_text"&&
          (result.source!=="ai_pdf_text"||result.aiProvider!=="cloudflare"))||
        (readingMode==="visual"&&result.source!=="ai_pdf_visual"))
        throw new Error("Leitura retornada com vínculo incorreto. Nenhuma medida foi aplicada.");
      setDraft(result as ApiResult);
      if(readingMode==="visual")setBillingUnavailable(false);
      setNotice(readingMode==="cloudflare_text"
        ?"Texto extraído pelo Cloudflare. Recuos geométricos não foram verificados. Confira cada dado no PDF original."
        :"Extração visual concluída. Confira cada página original antes de aproveitar uma medida.");
    }catch(cause){setError(String((cause as Error)?.message||cause));}
    finally{setLoading(false);}
  }
  function apply(){
    if(!draft||readOnly||!selected||draft.documentId!==selected.id||
      draft.documentVersion!==selected.version||!latest||!applied.length)return;
    const next:Prepared={};
    for(const row of applied){
      if(row.value===null||row.page===null||!row.usableForReview)continue;
      next[row.metric]={
        value:String(row.value).replace(".",","),
        evidence:makeReviewedDrawingEvidence(draft.fileName,row.page,row.quote),
      };
    }
    if(!Object.keys(next).length)return;
    onApply(next);
    setChecked({});
    setNotice("Somente as medidas conferidas foram copiadas ao formulário. Recalcule e examine o diagnóstico antes de registrar.");
  }
  return <section data-sigapro-project-pdf-ai="true"
    className="mt-5 min-w-0 rounded-2xl border border-sky-200 bg-white p-4 text-slate-900 dark:border-sky-700 dark:bg-slate-950 dark:text-white">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-extrabold">
        <BrainCircuit className="h-5 w-5 text-sky-700 dark:text-sky-300"/>
        Leitura assistida do projeto arquitetônico — homologação
      </h4>
      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-950">
        Sem aprovação automática
      </span>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
      O modo visual exige provedor com leitura de imagens configurado. O Cloudflare Workers AI
      extrai texto do PDF, mas não comprova cotas geométricas nem recuos. Toda medida
      exige página, valor, unidade e citação consistentes, com conferência humana.
    </p>
    {!plans.length?<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      Nenhum projeto arquitetônico PDF foi encontrado como documento armazenado neste processo.
    </p>:<>
      <label className="mt-3 block text-xs font-semibold">Projeto arquitetônico do processo
        <select className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 dark:bg-slate-900 dark:text-white"
          value={id} disabled={readOnly||loading}
          onChange={event=>{setId(event.target.value);setDraft(null);setChecked({});setConsent(false);}}>
          {plans.map(doc=><option key={doc.id} value={doc.id}>{doc.fileName} · versão {doc.version}</option>)}
        </select>
      </label>
      {!latest?<p role="alert" className="mt-2 text-xs font-semibold text-amber-800">
        Uma versão mais recente está disponível. Use a versão atual do projeto.
      </p>:null}
      <div role="group" aria-label="Escolha o tipo de leitura do PDF"
        className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
        <button type="button" data-sigapro-ai-mode-visual="true"
          aria-pressed={readingMode==="visual"} disabled={readOnly||loading}
          onClick={()=>changeReadingMode("visual")}
          className={`min-w-0 max-w-full rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${readingMode==="visual"
            ?"border-sky-500 bg-sky-50 ring-1 ring-sky-300 dark:bg-sky-950"
            :"border-slate-200 bg-white hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900"}`}>
          <span className="block break-words text-xs font-extrabold leading-5 [overflow-wrap:anywhere]">
            Leitura visual · Claude
          </span>
          <span className="mt-1 block break-words text-[11px] leading-5 text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
            Examina a prancha, mas requer saldo na API Anthropic. Não aprova projetos.
          </span>
        </button>
        {availability.textAlternativeAvailable?(
          <button type="button" data-sigapro-ai-mode-cloudflare-text="true"
            aria-pressed={readingMode==="cloudflare_text"} disabled={readOnly||loading}
            onClick={()=>changeReadingMode("cloudflare_text")}
            className={`min-w-0 max-w-full rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${readingMode==="cloudflare_text"
              ?"border-sky-500 bg-sky-50 ring-1 ring-sky-300 dark:bg-sky-950"
              :"border-slate-200 bg-white hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900"}`}>
            <span className="block break-words text-xs font-extrabold leading-5 [overflow-wrap:anywhere]">
              Leitura textual · Cloudflare
            </span>
            <span className="mt-1 block break-words text-[11px] leading-5 text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
              Usa a cota Workers AI disponível; extrai texto, sem conferir a geometria dos recuos.
            </span>
          </button>
        ):null}
      </div>
      <label className="mt-3 flex min-w-0 items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-950 dark:border-sky-700 dark:bg-slate-900 dark:text-white">
        <input type="checkbox" checked={consent} disabled={readOnly||loading}
          onChange={event=>setConsent(event.target.checked)} />
        <span className="min-w-0 break-words leading-5 [overflow-wrap:anywhere]">
          Autorizo o envio deste PDF ao {readingMode==="cloudflare_text"
            ?"Cloudflare Workers AI para extração exclusivamente textual"
            :"Claude/Anthropic para leitura visual assistida"}.
          Sei que a leitura pode falhar ou interpretar o documento incorretamente;
          nenhuma decisão nem mudança de processo será automática.
        </span>
      </label>
      <p role="status" data-sigapro-ai-pdf-provider-status={availability.status}
        className={"mt-3 min-w-0 max-w-full break-words text-xs font-semibold leading-5 [overflow-wrap:anywhere] "+(
          readyForSelectedMode?"text-emerald-800 dark:text-emerald-300":
          "text-amber-800 dark:text-amber-200")}>
        {readingMode==="cloudflare_text"&&availability.textAlternativeAvailable
          ?"Cloudflare Workers AI disponível nesta prévia para extração textual, sujeita à cota de uso. Este modo não mede recuos."
          :availability.message}
      </p>
      {selected && availability.status!=="checking" ? (
        <div role="status" data-sigapro-pdf-technical-preflight={
            availability.documentReady===true?"ready":
            availability.documentReady===false?"blocked":"unknown"}
          className={"mt-2 rounded-xl border p-3 text-xs font-semibold leading-5 "+(
            availability.documentReady===true
              ?"border-emerald-200 bg-emerald-50 text-emerald-950"
              :"border-amber-300 bg-amber-50 text-amber-950")}>
          {availability.documentMessage || "Não foi possível verificar a liberação técnica do documento."}
          {availability.documentReady===false ?
            <p className="mt-1">A leitura não será enviada ao provedor.
              Conclua a triagem e libere a versão válida para Análise Técnica
              pelo fluxo municipal; não é necessário alterar o banco manualmente.</p> : null}
        </div>
      ) : null}
      {availability.provider==="claude"&&availability.status==="ready"&&readingMode==="visual"?(
        <p role="note" data-sigapro-claude-credit-not-verified="true"
          className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
          Claude configurado no servidor, mas o saldo da API ainda não foi confirmado.
          Esta verificação não envia o PDF e não gera cobrança. Se a Anthropic
          estiver sem créditos ou com limite de gastos atingido, a leitura será
          interrompida com aviso específico, sem aplicar nenhuma medida.
        </p>
      ):null}
      {availability.mode==="text_only"&&availability.status==="ready"&&
        !availability.textAlternativeAvailable?(
        <p role="note" data-sigapro-pdf-visual-provider-needed="true"
          className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
          Para homologar a leitura visual de recuos, configure exclusivamente no servidor
          Preview desta branch um provedor de PDF com visão (por exemplo,
          SIGAPRO_AI_PDF_PROVIDER=claude e a credencial ANTHROPIC_API_KEY).
          A Cloudflare disponível neste ambiente é somente textual: não prova geometria.
          Nunca inclua a chave no formulário, no código ou na conversa.
        </p>
      ):null}
      {readingMode==="cloudflare_text"&&availability.textAlternativeAvailable?<p
        data-sigapro-pdf-text-only="true" role="status"
        className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-600 dark:bg-slate-900 dark:text-amber-200">
        Modo somente texto: sem validação geométrica de recuos ou reconhecimento visual das pranchas.
        Não usar a extração textual como diagnóstico urbanístico.
      </p>:null}
      {billingUnavailable&&availability.textAlternativeAvailable&&readingMode==="visual"?(
        <p role="note" data-sigapro-ai-credit-alternative="true"
          className="mt-3 min-w-0 max-w-full rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold leading-5 text-sky-950 break-words [overflow-wrap:anywhere]">
          Não há saldo disponível no Claude. Para testar a interpretação de textos do PDF,
          selecione acima “Leitura textual · Cloudflare” e autorize o novo envio.
          Essa alternativa não verifica a geometria dos recuos.
        </p>
      ):null}
      <Button type="button" data-sigapro-ai-read-project="true"
        className="mt-3 h-auto min-h-11 min-w-0 max-w-full whitespace-normal break-words bg-slate-950 px-4 py-2 !text-white [overflow-wrap:anywhere]"
        disabled={readOnly||!consent||!latest||loading||
          !readyForSelectedMode||availability.documentReady!==true}
        onClick={()=>void scan()}>
        {loading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileText className="mr-2 h-4 w-4"/>}
        {loading
          ? readingMode==="cloudflare_text"?"Extraindo texto com Cloudflare...":"Lendo prancha com Claude..."
          : readingMode==="cloudflare_text"?"Extrair texto com Cloudflare":"Ler projeto visualmente com Claude"}
      </Button>
    </>}
    {error?<p role="alert" className="mt-3 min-w-0 max-w-full rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900 break-words [overflow-wrap:anywhere] dark:bg-slate-900 dark:text-rose-100">
      {error}
    </p>:null}
    {draft? <div className="mt-4 space-y-3">
      {draft.source==="ai_pdf_text"?<p role="status"
        className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
        Workers AI converteu o PDF em texto. Recuos e geometria não foram validados:
        apenas informações com trecho literal podem ser conferidas no documento original.
      </p>:null}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <strong>{draft.documentType==="architectural_plan"?"Projeto identificado pela IA":"Identificação do documento incerta"}</strong>
        <p className="mt-1">Planta de implantação reconhecida: {draft.hasSitePlan?"sim":"não confirmada"}.
          A IA não determinou conformidade jurídica.</p>
        {draft.warnings.map((warning,i)=><p key={i} className="mt-1 flex gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0"/>{warning}
        </p>)}
      </div>
      <div className="grid min-w-0 gap-2 md:grid-cols-2">
        {draft.readings.map(row=>{
          const meta=URBAN_METRICS.find(m=>m.key===row.metric)!;
          const canUse=row.usableForReview && activeMetrics.includes(row.metric) &&
            !readOnly && draft.documentId===id;
          return <div key={row.metric}
            data-sigapro-pdf-measure={row.metric}
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <strong className="text-xs text-slate-950 dark:text-white">{meta.label}</strong>
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
              {row.value===null?"Não identificado":String(row.value)+" "+meta.unit}
            </p>
            {row.page!==null?<p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
              Página {row.page} · {row.confidence==="high"?"leitura nítida":"leitura a conferir"}
            </p>:null}
            {row.quote?<p className="mt-1 break-words text-xs italic text-slate-600 dark:text-slate-300">
              Trecho identificado: “{row.quote}”
            </p>:null}
            {!row.usableForReview?<p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              {row.reason}
            </p>:null}
            {canUse?<label className="mt-2 flex items-start gap-2 text-xs font-semibold">
              <input type="checkbox" checked={Boolean(checked[row.metric])}
                onChange={e=>setChecked(v=>({...v,[row.metric]:e.target.checked}))}/>
              Conferi a medida e a página no PDF original; usar na pré-análise
            </label>:null}
            {row.usableForReview&&!activeMetrics.includes(row.metric)?
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Sem norma validada correspondente a este índice; apenas informativo.
              </p>:null}
          </div>;
        })}
      </div>
      <Button type="button" data-sigapro-ai-apply-reviewed="true"
        className="min-h-11 bg-slate-950 !text-white" disabled={!applied.length||readOnly}
        onClick={apply}>
        <CheckCircle2 className="mr-2 h-4 w-4"/>
        Aplicar {applied.length} medida(s) conferida(s) à pré-análise
      </Button>
      {!activeMetrics.length?<p className="text-xs font-semibold text-amber-800">
        Nenhuma regra oficial ativa para esta zona e uso. A extração não pode produzir diagnóstico legal.
      </p>:null}
    </div>:null}
    {notice?<p role="status" className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 dark:bg-slate-900 dark:text-sky-100">
      {notice}
    </p>:null}
  </section>;
}
