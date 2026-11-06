import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backendClient } from "@/integrations/backend/databaseClient";
import { makeReviewedDrawingEvidence, type DrawingExtraction } from "@/lib/architecturalPdfReadings";
import { URBAN_METRICS, type UrbanMetric } from "@/lib/urbanPrecheck";
import type { ProcessRecord } from "@/lib/platform";

type Prepared = Partial<Record<UrbanMetric,{value:string;evidence:string}>>;
type ReadingMode = "visual" | "cloudflare_text" | "openai_visual" | "gemini_qa";
type ApiResult = DrawingExtraction & {
  processId:string; documentId:string; documentVersion:number; fileName:string;
  legalConformity:"not_evaluated"; humanReviewRequired:true;
  aiProvider:"cloudflare"|"claude"|"openai"|"gemini";
};
const normalized = (value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

export function ArchitecturalPdfAiPanel({
  process,readOnly,activeMetrics,onApply,documentId,compact=false,
}:{
  process:ProcessRecord; readOnly:boolean; activeMetrics:readonly UrbanMetric[];
  onApply:(reviewed:Prepared)=>void;
  documentId?:string;compact?:boolean;
}) {
  const availablePlans=useMemo(()=>process.documents.filter(doc=>
    doc.uploaded && Boolean(doc.filePath) &&
    /\.pdf$/i.test(doc.fileName||"") &&
    /projeto arquitetonico/.test(normalized(doc.label))
  ).sort((a,b)=>b.version-a.version),[process.documents]);
  const plans=useMemo(()=>documentId
    ?availablePlans.filter(doc=>doc.id===documentId)
    :availablePlans,[availablePlans,documentId]);
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
    openaiVisualAlternativeAvailable:boolean;
    geminiQaFixture:boolean;
    geminiQaAvailable:boolean;
  }>({status:"checking",message:"Verificando se o provedor de IA está configurado...",
    provider:"none",mode:"disabled",documentReady:null,documentMessage:"",
    textAlternativeAvailable:false,openaiVisualAlternativeAvailable:false,
    geminiQaFixture:false,geminiQaAvailable:false});

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
        openaiVisualAlternativeAvailable:false,
        geminiQaFixture:false,geminiQaAvailable:false,
        message:"A leitura assistida está disponível apenas para o analista autorizado."});
      return;
    }
    setAvailability({status:"checking",provider:"none",mode:"disabled",
      documentReady:null,documentMessage:"",textAlternativeAvailable:false,
      openaiVisualAlternativeAvailable:false,
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
        openaiVisualAlternativeAvailable?:boolean;
        geminiQaFixture?:boolean;geminiQaAvailable?:boolean;
      };
      if(!res.ok)throw new Error(value.error||"Não foi possível confirmar a disponibilidade da IA.");
      if(current)setAvailability({status:value.enabled?"ready":"disabled",
        provider:value.provider==="cloudflare"||value.provider==="claude"||value.provider==="openai"
          ?value.provider:"none",
        mode:value.mode==="visual"||value.mode==="text_only"?value.mode:"disabled",
        documentReady:typeof value.documentReady==="boolean"?value.documentReady:null,
        documentMessage:value.documentMessage||"",
        textAlternativeAvailable:value.textAlternativeAvailable===true,
        openaiVisualAlternativeAvailable:value.openaiVisualAlternativeAvailable===true,
        geminiQaFixture:value.geminiQaFixture===true,
        geminiQaAvailable:value.geminiQaAvailable===true,
        message:value.message||"Leitor assistido indisponível."});
    })().catch((err:unknown)=>{
      if(current)setAvailability({status:"disabled",provider:"none",mode:"disabled",
        documentReady:null,documentMessage:"",textAlternativeAvailable:false,
        openaiVisualAlternativeAvailable:false,
        geminiQaFixture:false,geminiQaAvailable:false,
        message:String((err as Error)?.message||err)});
    });
    return()=>{current=false;};
  },[process.id,readOnly,id,plans]);

  const selected=plans.find(doc=>doc.id===id);
  const latest=availablePlans[0]?.id===id;
  const readyForSelectedMode=readingMode==="cloudflare_text"
    ?availability.textAlternativeAvailable
    :readingMode==="openai_visual"
      ?availability.openaiVisualAlternativeAvailable
      :readingMode==="gemini_qa"
        ?availability.geminiQaAvailable
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
        (readingMode==="visual"&&result.source!=="ai_pdf_visual")||
        (readingMode==="openai_visual"&&
          (result.source!=="ai_pdf_visual"||result.aiProvider!=="openai"))||
        (readingMode==="gemini_qa"&&
          (result.source!=="ai_pdf_visual"||result.aiProvider!=="gemini")))
        throw new Error("Leitura retornada com vínculo incorreto. Nenhuma medida foi aplicada.");
      setDraft(result as ApiResult);
      if(readingMode!=="cloudflare_text")setBillingUnavailable(false);
      setNotice(readingMode==="cloudflare_text"
        ?"Leitura Documental concluída pelo SIGAPRO IA. Recuos geométricos não foram verificados. Confira cada dado no PDF original."
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
    data-sigapro-document-ai-embedded={compact?"true":"false"}
    className={`min-w-0 max-w-full overflow-hidden rounded-2xl border border-sky-200 bg-white !text-slate-950 dark:border-sky-500 dark:bg-[#0b172a] dark:!text-slate-100 ${compact?"p-3":"mt-5 p-4"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex min-w-0 items-center gap-2 break-words text-sm font-extrabold text-slate-950 dark:text-white [overflow-wrap:anywhere]">
        <BrainCircuit className="h-5 w-5 text-sky-700 dark:text-sky-300"/>
        SIGAPRO IA · Leitura Técnica do Projeto
      </h4>
      <span className="max-w-full rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold !text-amber-950 dark:bg-amber-950 dark:!text-amber-100">
        Sem aprovação automática
      </span>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
      O SIGAPRO IA reúne leitura visual das pranchas e extração textual de documentos.
      Os recursos são complementares: somente a leitura visual inspeciona os desenhos.
      Nenhuma modalidade comprova conformidade legal automaticamente; confira cada cota.
    </p>
    {!plans.length?<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      Nenhum projeto arquitetônico PDF foi encontrado como documento armazenado neste processo.
    </p>:<>
      <label className="mt-3 block break-words text-xs font-semibold text-slate-900 dark:text-white">Projeto arquitetônico do processo
        <select className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 !text-slate-950 dark:border-slate-600 dark:bg-[#17283d] dark:!text-white"
          value={id} disabled={readOnly||loading||Boolean(documentId)}
          onChange={event=>{setId(event.target.value);setDraft(null);setChecked({});setConsent(false);}}>
          {plans.map(doc=><option key={doc.id} value={doc.id}>{doc.fileName} · versão {doc.version}</option>)}
        </select>
      </label>
      {!latest?<p role="alert" className="mt-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
        Uma versão mais recente está disponível. Use a versão atual do projeto.
      </p>:null}
      <div role="group" aria-label="Escolha o tipo de leitura do PDF"
        className={`mt-3 grid min-w-0 gap-2 ${compact?"grid-cols-1":"md:grid-cols-2"}`}>
        <button type="button" data-sigapro-ai-mode-visual="true"
          aria-pressed={readingMode==="visual"} disabled={readOnly||loading}
          onClick={()=>changeReadingMode("visual")}
          className={`min-w-0 max-w-full rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${readingMode==="visual"
            ?"border-sky-500 bg-sky-50 !text-sky-950 ring-1 ring-sky-300 dark:border-sky-400 dark:bg-[#103b5e] dark:!text-white"
            :"border-slate-300 bg-white !text-slate-950 hover:border-sky-300 dark:border-slate-600 dark:bg-[#17283d] dark:!text-white dark:hover:border-sky-400"}`}>
          <span className="block break-words text-xs font-extrabold leading-5 !text-slate-950 dark:!text-white [overflow-wrap:anywhere]">
            SIGAPRO IA · Leitura Visual
          </span>
          <span className="mt-1 block break-words text-[11px] leading-5 !text-slate-700 dark:!text-slate-100 [overflow-wrap:anywhere]">
            Analisa pranchas e cotas identificadas. Requer disponibilidade de créditos no serviço contratado.
          </span>
        </button>
        {availability.textAlternativeAvailable?(
          <button type="button" data-sigapro-ai-mode-cloudflare-text="true"
            aria-pressed={readingMode==="cloudflare_text"} disabled={readOnly||loading}
            onClick={()=>changeReadingMode("cloudflare_text")}
            className={`min-w-0 max-w-full rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${readingMode==="cloudflare_text"
              ?"border-sky-500 bg-sky-50 !text-sky-950 ring-1 ring-sky-300 dark:border-sky-400 dark:bg-[#103b5e] dark:!text-white"
              :"border-slate-300 bg-white !text-slate-950 hover:border-sky-300 dark:border-slate-600 dark:bg-[#17283d] dark:!text-white dark:hover:border-sky-400"}`}>
            <span className="block break-words text-xs font-extrabold leading-5 !text-slate-950 dark:!text-white [overflow-wrap:anywhere]">
              SIGAPRO IA · Leitura Documental
            </span>
            <span className="mt-1 block break-words text-[11px] leading-5 !text-slate-700 dark:!text-slate-100 [overflow-wrap:anywhere]">
              Extrai o conteúdo escrito do PDF, sujeito à cota disponível; não verifica a geometria dos recuos.
            </span>
          </button>
        ):null}
        {availability.openaiVisualAlternativeAvailable?(
          <button type="button" data-sigapro-ai-mode-openai-visual="true"
            aria-pressed={readingMode==="openai_visual"} disabled={readOnly||loading}
            onClick={()=>changeReadingMode("openai_visual")}
            className={`min-w-0 max-w-full rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${readingMode==="openai_visual"
              ?"border-sky-500 bg-sky-50 !text-sky-950 ring-1 ring-sky-300 dark:border-sky-400 dark:bg-[#103b5e] dark:!text-white"
              :"border-slate-300 bg-white !text-slate-950 hover:border-sky-300 dark:border-slate-600 dark:bg-[#17283d] dark:!text-white dark:hover:border-sky-400"}`}>
            <span className="block break-words text-xs font-extrabold leading-5 !text-slate-950 dark:!text-white [overflow-wrap:anywhere]">
              SIGAPRO IA · Leitura Avançada
            </span>
            <span className="mt-1 block break-words text-[11px] leading-5 !text-slate-700 dark:!text-slate-100 [overflow-wrap:anywhere]">
              Examina o PDF visualmente, incluindo imagens das pranchas em alta definição.
              Requer API independente contratada.
            </span>
          </button>
        ):null}
        {availability.geminiQaFixture?(
          <button type="button" data-sigapro-ai-mode-gemini-qa="true"
            aria-pressed={readingMode==="gemini_qa"} disabled={readOnly||loading}
            onClick={()=>changeReadingMode("gemini_qa")}
            className={`min-w-0 max-w-full rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${readingMode==="gemini_qa"
              ?"border-sky-500 bg-sky-50 !text-sky-950 ring-1 ring-sky-300 dark:border-sky-400 dark:bg-[#103b5e] dark:!text-white"
              :"border-slate-300 bg-white !text-slate-950 dark:border-slate-600 dark:bg-[#17283d] dark:!text-white"}`}>
            <span className="block text-xs font-extrabold !text-slate-950 dark:!text-white">
              SIGAPRO IA · Ensaio Visual Gratuito
            </span>
            <span className="mt-1 block break-words text-[11px] leading-5 !text-slate-700 dark:!text-slate-100 [overflow-wrap:anywhere]">
              Exclusivo para a planta fictícia 04. Visualiza desenhos do PDF,
              depende da chave gratuita do ambiente de testes e da cota do serviço.
              {availability.geminiQaAvailable?" Pronto para solicitar a análise.":" Aguardando habilitação pelo administrador."}
            </span>
          </button>
        ):null}
      </div>
      <label className="mt-3 flex min-w-0 items-start gap-2 rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs font-semibold !text-sky-950 dark:border-sky-500 dark:bg-[#103b5e] dark:!text-sky-50">
        <input type="checkbox" checked={consent} disabled={readOnly||loading}
          onChange={event=>setConsent(event.target.checked)} />
        <span className="min-w-0 break-words leading-5 [overflow-wrap:anywhere]">
          Autorizo o envio deste PDF ao prestador externo de processamento correspondente
          à modalidade SIGAPRO IA selecionada. Sei que a leitura pode falhar
          e que nenhuma decisão nem mudança no processo será automática.
          O prestador está identificado em “Informações sobre o processamento” abaixo.
          {readingMode==="gemini_qa"
            ?" O nível gratuito pode utilizar os dados para aprimorar serviços do fornecedor; esta opção aceita somente o PDF fictício de ensaio."
            :null}
        </span>
      </label>
      <details data-sigapro-ai-processor-disclosure="true"
        className="mt-2 min-w-0 max-w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs !text-slate-800 dark:border-slate-600 dark:bg-[#17283d] dark:!text-slate-100">
        <summary className="cursor-pointer break-words font-semibold [overflow-wrap:anywhere]">
          Informações sobre o processamento
        </summary>
        <p className="mt-2 break-words leading-5 [overflow-wrap:anywhere]">
          O PDF será transmitido a um prestador externo exclusivamente para o recurso
          selecionado, após sua autorização.
          {readingMode==="cloudflare_text"
            ?" Prestador: Cloudflare Workers AI (extração textual)."
            :readingMode==="gemini_qa"
              ?" Prestador: Google Gemini API, nível gratuito. O fornecedor informa que dados desse nível podem ser usados para melhoria dos produtos. Não utilize documentos reais ou confidenciais."
            :readingMode==="openai_visual"||availability.provider==="openai"
              ?" Prestador: OpenAI (API de leitura visual de PDF, faturada separadamente do ChatGPT Plus)."
              :" Prestador: Anthropic, serviço Claude (leitura visual)."}
          Consulte as condições de privacidade e contratação aplicáveis à Prefeitura.
        </p>
      </details>
      <p role="status" data-sigapro-ai-pdf-provider-status={availability.status}
        className={"mt-3 min-w-0 max-w-full break-words text-xs font-semibold leading-5 [overflow-wrap:anywhere] "+(
          readyForSelectedMode?"text-emerald-800 dark:text-emerald-300":
          "text-amber-800 dark:text-amber-200")}>
        {availability.status==="checking"
          ?"Verificando a disponibilidade do SIGAPRO IA..."
          :readyForSelectedMode
            ?readingMode==="cloudflare_text"
              ?"Leitura Documental disponível, sujeita à cota de uso. Este modo não mede recuos."
              :readingMode==="openai_visual"
                ?"Leitura Avançada configurada. As pranchas serão processadas com imagens em alta definição; depende de créditos da API."
                :readingMode==="gemini_qa"
                  ?"Ensaio visual gratuito habilitado somente para o projeto fictício 04, sujeito à cota diária do prestador."
                  :"Leitura Visual configurada. A execução depende dos créditos do serviço de processamento."
            :"Módulo de leitura indisponível. Solicite a conferência das configurações e permissões."}
      </p>
      {selected && availability.status!=="checking" ? (
        <div role="status" data-sigapro-pdf-technical-preflight={
            availability.documentReady===true?"ready":
            availability.documentReady===false?"blocked":"unknown"}
          className={"mt-2 rounded-xl border p-3 text-xs font-semibold leading-5 "+(
            availability.documentReady===true
              ?"border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-100"
              :"border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100")}>
          {availability.documentMessage || "Não foi possível verificar a liberação técnica do documento."}
          {availability.documentReady===false ?
            <p className="mt-1">A leitura não será enviada ao provedor.
              Conclua a triagem e libere a versão válida para Análise Técnica
              pelo fluxo municipal; não é necessário alterar o banco manualmente.</p> : null}
        </div>
      ) : null}
      {((availability.provider==="claude"&&availability.status==="ready"&&readingMode==="visual")||
        (readingMode==="openai_visual"&&availability.openaiVisualAlternativeAvailable))?(
        <p role="note" data-sigapro-claude-credit-not-verified="true"
          className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100">
          A Leitura Visual está configurada, mas o saldo do prestador ainda não foi confirmado.
          Esta verificação não transmite o PDF nem gera cobrança. Se o limite de
          processamento for atingido, a operação será interrompida sem aplicar medidas.
        </p>
      ):null}
      {availability.mode==="text_only"&&availability.status==="ready"&&
        !availability.textAlternativeAvailable?(
        <p role="note" data-sigapro-pdf-visual-provider-needed="true"
          className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100">
          Para homologar a leitura visual de recuos, o administrador técnico deve habilitar
          o serviço de análise de PDFs com suporte a imagens no ambiente de testes.
          A Leitura Documental extrai apenas texto e não comprova geometria.
          Nunca informe credenciais em formulários ou mensagens.
        </p>
      ):null}
      {readingMode==="cloudflare_text"&&availability.textAlternativeAvailable?<p
        data-sigapro-pdf-text-only="true" role="status"
        className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-600 dark:bg-slate-900 dark:text-amber-200">
        Modo somente texto: sem validação geométrica de recuos ou reconhecimento visual das pranchas.
        Não usar a extração textual como diagnóstico urbanístico.
      </p>:null}
      {billingUnavailable&&availability.textAlternativeAvailable&&readingMode!=="cloudflare_text"?(
        <p role="note" data-sigapro-ai-credit-alternative="true"
          className="mt-3 min-w-0 max-w-full rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold leading-5 text-sky-950 break-words dark:border-sky-600 dark:bg-sky-950 dark:text-sky-100 [overflow-wrap:anywhere]">
          O serviço de Leitura Visual está sem créditos disponíveis.
          Para testar a extração de texto, selecione “SIGAPRO IA · Leitura Documental”
          e autorize o novo envio. A alternativa não verifica a geometria dos recuos.
        </p>
      ):null}
      <Button type="button" data-sigapro-ai-read-project="true"
        className="mt-3 h-auto min-h-11 min-w-0 max-w-full whitespace-normal break-words bg-slate-950 px-4 py-2 !text-white [overflow-wrap:anywhere]"
        disabled={readOnly||!consent||!latest||loading||
          !readyForSelectedMode||availability.documentReady!==true}
        onClick={()=>void scan()}>
        {loading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileText className="mr-2 h-4 w-4"/>}
        {loading
          ? readingMode==="cloudflare_text"?"SIGAPRO IA · Extraindo texto...":
            readingMode==="openai_visual"?"SIGAPRO IA · Examinando PDF em alta definição...":
            readingMode==="gemini_qa"?"SIGAPRO IA · Testando planta fictícia...":"SIGAPRO IA · Analisando prancha..."
          : readingMode==="cloudflare_text"?"Extrair texto com SIGAPRO IA":
            readingMode==="openai_visual"?"Analisar PDF com Leitura Avançada":
            readingMode==="gemini_qa"?"Executar ensaio visual do projeto 04":"Analisar prancha com SIGAPRO IA"}
      </Button>
    </>}
    {error?<p role="alert" className="mt-3 min-w-0 max-w-full rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900 break-words [overflow-wrap:anywhere] dark:bg-slate-900 dark:text-rose-100">
      {error}
    </p>:null}
    {draft? <div className="mt-4 space-y-3">
      {draft.source==="ai_pdf_text"?<p role="status"
        className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
        A Leitura Documental converteu o PDF em texto. Recuos e geometria não foram
        validados: somente trechos verificáveis podem ser conferidos no PDF original.
      </p>:null}
      <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 dark:border-slate-600 dark:bg-[#17283d] dark:text-slate-100 [overflow-wrap:anywhere]">
        <strong>{draft.documentType==="architectural_plan"?"Projeto identificado pela IA":"Identificação do documento incerta"}</strong>
        <p className="mt-1">Planta de implantação reconhecida: {draft.hasSitePlan?"sim":"não confirmada"}.
          A IA não determinou conformidade jurídica.</p>
        {draft.warnings.map((warning,i)=><p key={i} className="mt-1 flex gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0"/>{warning}
        </p>)}
      </div>
      <div className={`grid min-w-0 gap-2 ${compact?"grid-cols-1":"md:grid-cols-2"}`}>
        {draft.readings.map(row=>{
          const meta=URBAN_METRICS.find(m=>m.key===row.metric)!;
          const canUse=row.usableForReview && activeMetrics.includes(row.metric) &&
            !readOnly && draft.documentId===id;
          return <div key={row.metric}
            data-sigapro-pdf-measure={row.metric}
            className="min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-slate-900 dark:border-slate-600 dark:bg-[#17283d] dark:text-slate-100 [overflow-wrap:anywhere]">
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
            {!row.usableForReview?<p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
              {row.reason}
            </p>:null}
            {canUse?<label className="mt-2 flex min-w-0 items-start gap-2 text-xs font-semibold text-slate-950 dark:text-slate-100">
              <input type="checkbox" checked={Boolean(checked[row.metric])}
                onChange={e=>setChecked(v=>({...v,[row.metric]:e.target.checked}))}/>
              Conferi a medida e a página no PDF original; usar na pré-análise
            </label>:null}
            {row.usableForReview&&!activeMetrics.includes(row.metric)?
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                Sem norma validada correspondente a este índice; apenas informativo.
              </p>:null}
          </div>;
        })}
      </div>
      <Button type="button" data-sigapro-ai-apply-reviewed="true"
        className="h-auto min-h-11 min-w-0 max-w-full whitespace-normal break-words bg-slate-950 py-2 !text-white [overflow-wrap:anywhere]" disabled={!applied.length||readOnly}
        onClick={apply}>
        <CheckCircle2 className="mr-2 h-4 w-4"/>
        Enviar {applied.length} medida(s) conferida(s) à pré-conferência
      </Button>
      {!activeMetrics.length?<p className="text-xs font-semibold text-amber-800">
        Nenhuma regra oficial ativa para esta zona e uso. A extração não pode produzir diagnóstico legal.
      </p>:null}
    </div>:null}
    {notice?<p role="status" className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-500 dark:bg-[#103b5e] dark:text-sky-100">
      {notice}
    </p>:null}
  </section>;
}
