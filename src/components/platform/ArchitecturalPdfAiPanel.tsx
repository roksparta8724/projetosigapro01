import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backendClient } from "@/integrations/backend/databaseClient";
import { benchmarkQa04ArchitecturalReadings, makeReviewedDrawingEvidence, type DrawingExtraction } from "@/lib/architecturalPdfReadings";
import { URBAN_METRICS, type UrbanMetric } from "@/lib/urbanPrecheck";
import type { UrbanTerritorialReadiness } from "@/lib/urbanTerritorialReadiness";
import {verifiedUrbanBaseline,type UrbanExistingLegalBaseline} from "@/lib/urbanExistingLegalBaseline";
import type { ProcessRecord } from "@/lib/platform";

type Prepared = Partial<Record<UrbanMetric,{value:string;evidence:string}>>;
type ReadingMode = "native_text" | "visual" | "cloudflare_text" | "openai_visual" | "gemini_qa";
type ApiResult = DrawingExtraction & {
  processId:string; documentId:string; documentVersion:number; fileName:string;
  legalConformity:"not_evaluated"; humanReviewRequired:true;
  aiProvider:"sigapro_local"|"cloudflare"|"claude"|"openai"|"gemini";
  territorialContext?:UrbanTerritorialReadiness|null;
  legalBaseline?:UrbanExistingLegalBaseline|null;
};
const normalized = (value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

export function ArchitecturalPdfAiPanel({
  process,readOnly,activeMetrics,onApply,onGoToPage,documentId,compact=false,
}:{
  process:ProcessRecord; readOnly:boolean; activeMetrics:readonly UrbanMetric[];
  onApply:(reviewed:Prepared)=>void;
  onGoToPage?:(page:number)=>void;
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
  const [readingMode,setReadingMode]=useState<ReadingMode>("native_text");
  const [billingUnavailable,setBillingUnavailable]=useState(false);
  const [loading,setLoading]=useState(false);
  const scanController=useRef<AbortController|null>(null);
  const scanSequence=useRef(0);
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
    nativeTextAvailable:boolean;
  }>({status:"checking",message:"Verificando se o provedor de IA está configurado...",
    provider:"none",mode:"disabled",documentReady:null,documentMessage:"",
    textAlternativeAvailable:false,openaiVisualAlternativeAvailable:false,
    geminiQaFixture:false,geminiQaAvailable:false,nativeTextAvailable:false});

  const [territorial,setTerritorial]=useState<UrbanTerritorialReadiness|null>(null);
  const [legalBaseline,setLegalBaseline]=useState<UrbanExistingLegalBaseline|null>(null);
  const [error,setError]=useState("");
  const [errorCode,setErrorCode]=useState("");
  const [draft,setDraft]=useState<ApiResult|null>(null);
  const [checked,setChecked]=useState<Partial<Record<UrbanMetric,boolean>>>({});
  const [notice,setNotice]=useState("");
  useEffect(()=>()=>{scanSequence.current++;scanController.current?.abort();},[]);
  function cancelScan(){
    if(!scanController.current)return;
    scanSequence.current++;
    scanController.current.abort();
    scanController.current=null;
    setLoading(false);
    setNotice("Leitura interrompida pelo analista. O PDF e as medidas conferidas anteriormente foram preservados.");
  }

  useEffect(()=>{
    setId(plans[0]?.id||"");setConsent(false);setReadingMode("native_text");
    setBillingUnavailable(false);setDraft(null);setTerritorial(null);setLegalBaseline(null);setChecked({});setError("");setErrorCode("");setNotice("");
  },[process.id,plans[0]?.id]);

  useEffect(()=>{
    let current=true;
    const checkingController=new AbortController();
    const checkingTimeout=setTimeout(()=>checkingController.abort(),18000);
    if(readOnly){
      clearTimeout(checkingTimeout);
      setAvailability({status:"disabled",provider:"none",mode:"disabled",
        documentReady:null,documentMessage:"",textAlternativeAvailable:false,
        openaiVisualAlternativeAvailable:false,
        geminiQaFixture:false,geminiQaAvailable:false,
        nativeTextAvailable:false,
        message:"A leitura assistida está disponível apenas para o analista autorizado."});
      return;
    }
    setAvailability({status:"checking",provider:"none",mode:"disabled",
      documentReady:null,documentMessage:"",textAlternativeAvailable:false,
      openaiVisualAlternativeAvailable:false,
      geminiQaFixture:false,geminiQaAvailable:false,
      nativeTextAvailable:false,
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
        method:"GET",cache:"no-store",signal:checkingController.signal,
        headers:{Authorization:"Bearer "+jwt},
      });
      const value=await res.json() as {
        enabled?:boolean;provider?:string;mode?:string;message?:string;error?:string;
        documentReady?:boolean|null;documentMessage?:string;
        textAlternativeAvailable?:boolean;
        openaiVisualAlternativeAvailable?:boolean;
        geminiQaFixture?:boolean;geminiQaAvailable?:boolean;
        nativeTextAvailable?:boolean;
        territorialContext?:UrbanTerritorialReadiness|null;
        legalBaseline?:UrbanExistingLegalBaseline|null;
      };
      if(!res.ok)throw new Error(value.error||"Não foi possível confirmar a disponibilidade da IA.");
      if(current)setTerritorial(value.territorialContext??null);
      if(current)setLegalBaseline(verifiedUrbanBaseline(value.legalBaseline,process.tenantId));
      if(current)setAvailability({status:(value.enabled||value.nativeTextAvailable===true)?"ready":"disabled",
        provider:value.provider==="cloudflare"||value.provider==="claude"||value.provider==="openai"
          ?value.provider:"none",
        mode:value.mode==="visual"||value.mode==="text_only"?value.mode:"disabled",
        documentReady:typeof value.documentReady==="boolean"?value.documentReady:null,
        documentMessage:value.documentMessage||"",
        textAlternativeAvailable:value.textAlternativeAvailable===true,
        openaiVisualAlternativeAvailable:value.openaiVisualAlternativeAvailable===true,
        geminiQaFixture:value.geminiQaFixture===true,
        geminiQaAvailable:value.geminiQaAvailable===true,
        nativeTextAvailable:value.nativeTextAvailable===true,
        message:value.message||"Leitor assistido indisponível."});
    })().catch((err:unknown)=>{
      if(current)setAvailability({status:"disabled",provider:"none",mode:"disabled",
        documentReady:null,documentMessage:"",textAlternativeAvailable:false,
        openaiVisualAlternativeAvailable:false,
        geminiQaFixture:false,geminiQaAvailable:false,
        nativeTextAvailable:false,
        message:checkingController.signal.aborted
          ?"A verificação de disponibilidade excedeu o tempo limite. Reabra o leitor para tentar novamente."
          :String((err as Error)?.message||err)});
    }).finally(()=>clearTimeout(checkingTimeout));
    return()=>{current=false;clearTimeout(checkingTimeout);checkingController.abort();};
  },[process.id,readOnly,id,plans]);

  const selected=plans.find(doc=>doc.id===id);
  const latest=availablePlans[0]?.id===id;
  const readyForSelectedMode=readingMode==="native_text"
    ?availability.nativeTextAvailable
    :readingMode==="cloudflare_text"
    ?availability.textAlternativeAvailable
    :readingMode==="openai_visual"
      ?availability.openaiVisualAlternativeAvailable
      :readingMode==="gemini_qa"
        ?availability.geminiQaAvailable
      :availability.status==="ready"&&availability.mode==="visual";
  const changeReadingMode=(next:ReadingMode)=>{
    if(readOnly||loading||next===readingMode)return;
    setReadingMode(next);setConsent(false);setDraft(null);
    setChecked({});setError("");setErrorCode("");setNotice("");
  };
  const applied=draft?.readings.filter(row=>
    row.usableForReview && checked[row.metric] &&
    activeMetrics.includes(row.metric))||[];
  async function scan(){
    if(readOnly||!selected||!latest||
      (readingMode!=="native_text"&&!consent)||loading||
      !readyForSelectedMode||availability.documentReady!==true)return;
    setError("");setErrorCode("");setNotice("");setLoading(true);
    const controller=new AbortController();
    const operation=++scanSequence.current;
    scanController.current=controller;
    const timeLimit=setTimeout(()=>controller.abort(),67000);
    try{
      const session=(await backendClient.auth.getSession()).data?.session;
      const jwt=session?.access_token||session?.accessToken||session?.token||"";
      if(!jwt)throw new Error("Sessão expirada. Entre novamente no SIGAPRO.");
      const response=await fetch("/api/ai-assistant?action=project-extract",{
        method:"POST",cache:"no-store",signal:controller.signal,
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+jwt},
        body:JSON.stringify({processId:process.id,documentId:selected.id,
          confirmedTransfer:true,readingMode}),
      });
      const result=await response.json() as Partial<ApiResult>&{error?:string;code?:string};
      if(operation!==scanSequence.current)return;
      if(!response.ok){
        if(result.code==="AI_PROVIDER_BILLING")setBillingUnavailable(true);
        if(typeof result.code==="string"&&/^[A-Z][A-Z0-9_]{2,60}$/.test(result.code))
          setErrorCode(result.code);
        throw new Error(result.error||"Não foi possível ler o projeto.");
      }
      if(result.processId!==process.id||result.documentId!==selected.id||
        result.documentVersion!==selected.version||
        !Array.isArray(result.readings)||!["ai_pdf_visual","ai_pdf_text","pdf_text_local"].includes(result.source)||
        result.automaticallyApproved!==false||result.legalConformity!=="not_evaluated"||
        (readingMode==="native_text"&&
          (result.source!=="pdf_text_local"||result.aiProvider!=="sigapro_local"))||
        (readingMode==="cloudflare_text"&&
          (result.source!=="ai_pdf_text"||result.aiProvider!=="cloudflare"))||
        (readingMode==="visual"&&result.source!=="ai_pdf_visual")||
        (readingMode==="openai_visual"&&
          (result.source!=="ai_pdf_visual"||result.aiProvider!=="openai"))||
        (readingMode==="gemini_qa"&&
          (result.source!=="ai_pdf_visual"||result.aiProvider!=="gemini")))
        throw new Error("Leitura retornada com vínculo incorreto. Nenhuma medida foi aplicada.");
      setChecked({});
      setDraft(result as ApiResult);
      setTerritorial(result.territorialContext??null);
      setLegalBaseline(verifiedUrbanBaseline(result.legalBaseline,process.tenantId));
      if(readingMode!=="cloudflare_text")setBillingUnavailable(false);
      setNotice(readingMode==="native_text"
        ?"Texto do PDF lido localmente, sem IA e sem fornecedor externo. Confira a geometria e cada cota na prancha original."
        :readingMode==="cloudflare_text"
          ?"Leitura Documental concluída pelo SIGAPRO IA. Recuos geométricos não foram verificados. Confira cada dado no PDF original."
          :"Extração visual concluída. Confira cada página original antes de aproveitar uma medida.");
    }catch(cause){
      if(operation===scanSequence.current){
        setError(controller.signal.aborted
          ?"O tempo máximo da leitura foi atingido. Nenhuma medida nova foi aplicada; tente a Leitura Local ou confira a disponibilidade do provedor."
          :String((cause as Error)?.message||cause));
      }
    }finally{
      clearTimeout(timeLimit);
      if(operation===scanSequence.current){
        scanController.current=null;
        setLoading(false);
      }
    }
  }
  async function downloadReadingReport(){
    if(!draft||!selected||!latest||draft.documentId!==selected.id||
      draft.documentVersion!==selected.version||readOnly)return;
    try{
      const {createArchitecturalReadingReportPdf}=await import("@/lib/architecturalReadingReportPdf");
      const pdf=createArchitecturalReadingReportPdf({
        extraction:draft,processId:process.id,documentId:draft.documentId,
        documentVersion:draft.documentVersion,fileName:draft.fileName,
        territorial:draft.territorialContext??territorial,
        legalBaseline:verifiedUrbanBaseline(draft.legalBaseline,process.tenantId)??legalBaseline,
      });
      pdf.save("SIGAPRO-leitura-"+process.id.slice(0,8)+"-v"+selected.version+".pdf");
      setNotice("Relatório preliminar de leitura gerado em PDF. As medidas exigem conferência humana; não é um parecer de conformidade.");
    }catch{
      setError("Não foi possível gerar o relatório PDF da leitura. A análise não foi alterada.");
    }
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
    className={`min-w-0 max-w-full overflow-hidden rounded-[22px] border border-slate-200 bg-[#f8fafc] !text-slate-950 shadow-[0_8px_28px_rgba(15,23,42,0.06)] dark:border-slate-600 dark:bg-[#101e30] dark:!text-white ${compact?"p-3":"mt-5 p-4"}`}>
    <div data-sigapro-premium-ai-header="true" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[linear-gradient(125deg,#0b233c_0%,#14517a_100%)] px-4 py-4 text-white shadow-sm">
      <h4 className="flex min-w-0 items-center gap-2 break-words text-sm font-extrabold !text-white [overflow-wrap:anywhere]">
        <BrainCircuit className="h-5 w-5 text-sky-200"/>
        SIGAPRO IA · Leitura Técnica do Projeto
      </h4>
      <span className="max-w-full rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-xs font-bold !text-white">
        Sem aprovação automática
      </span>
    </div>
    <p className="mt-3 px-1 text-[13px] leading-6 text-slate-700 dark:text-slate-200">
      Leia as cotas do PDF, confira as páginas e encaminhe apenas as medidas verificadas.
      A análise legal e geométrica exige validação técnica independente.
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
      <details data-sigapro-ai-method-selector="true"
        open={readingMode!=="native_text" ? true : undefined}
        className="mt-3 min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-[#192c42]">
        <summary className="cursor-pointer text-[13px] font-extrabold text-slate-950 dark:text-white">
          Método: {readingMode==="native_text"?"leitura local sem custo":
            readingMode==="cloudflare_text"?"interpretação de texto":
            readingMode==="gemini_qa"?"ensaio visual QA04":"leitura visual com IA"} · alterar
        </summary>
      <div role="group" aria-label="Escolha o tipo de leitura do PDF"
        className={`mt-3 grid min-w-0 gap-2 ${compact?"grid-cols-1":"md:grid-cols-2"}`}>
        <button type="button" data-sigapro-ai-mode-native-text="true"
          aria-pressed={readingMode==="native_text"} disabled={readOnly||loading}
          onClick={()=>changeReadingMode("native_text")}
          className={`min-w-0 max-w-full rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${readingMode==="native_text"
            ?"border-emerald-500 bg-emerald-50 !text-emerald-950 ring-1 ring-emerald-300 dark:border-emerald-400 dark:bg-[#103d38] dark:!text-white"
            :"border-slate-300 bg-white !text-slate-950 dark:border-slate-600 dark:bg-[#17283d] dark:!text-white"}`}>
          <span className="block break-words text-xs font-extrabold leading-5 !text-slate-950 dark:!text-white [overflow-wrap:anywhere]">
            SIGAPRO · Leitura Local de Cotas
          </span>
          <span className="mt-1 block break-words text-[11px] leading-5 !text-slate-700 dark:!text-slate-100 [overflow-wrap:anywhere]">
            Lê texto selecionável do PDF real sem usar IA, créditos nem serviços externos.
            Identifica cotas e páginas; não mede desenhos ou avalia a lei.
          </span>
        </button>
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
      </details>
      {readingMode!=="native_text"?(<>
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
      </>):(
        <p data-sigapro-ai-no-external-transfer="true" role="status"
          className="mt-3 min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100">
          Leitura executada no servidor do SIGAPRO, sem envio do documento a modelos ou APIs de IA.
          Disponível para PDFs com textos selecionáveis e exige conferência técnica humana.
        </p>
      )}
      <p role="status" data-sigapro-ai-pdf-provider-status={availability.status}
        className={"mt-3 min-w-0 max-w-full break-words text-xs font-semibold leading-5 [overflow-wrap:anywhere] "+(
          readyForSelectedMode?"text-emerald-800 dark:text-emerald-300":
          "text-amber-800 dark:text-amber-200")}>
        {availability.status==="checking"
          ?"Verificando a disponibilidade do SIGAPRO IA..."
          :readyForSelectedMode
            ?readingMode==="native_text"
              ?"Leitura Local habilitada: o PDF será interpretado pelo próprio SIGAPRO, sem dependência de API externa."
              :readingMode==="cloudflare_text"
                ?"Integração textual configurada, mas a conexão e a cota só serão confirmadas na execução. Este modo não mede recuos."
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
      {territorial?<details data-sigapro-territorial-readiness={territorial.cadastralLink}
        className="mt-3 min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 text-slate-900 shadow-sm dark:border-slate-600 dark:bg-[#1a3049] dark:text-white [overflow-wrap:anywhere]">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-[13px] font-extrabold text-slate-950 dark:text-white">
          <span>Imóvel e zoneamento</span>
          <span className={territorial.zoneVerified
            ?"rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-950 dark:bg-emerald-900 dark:text-white"
            :"rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-950 dark:bg-amber-900 dark:text-white"}>
            {territorial.zoneVerified?"Zona conferida":"Pendente"}
          </span>
        </summary>
        <div className="mt-3 border-t border-slate-200 pt-2 text-[13px] leading-5 dark:border-slate-600">
        <p className="mt-1 text-xs leading-5">
          {territorial.cadastralLink==="missing"
            ?"Este processo ainda não tem imóvel cadastral vinculado. Sem esse vínculo, endereço e zona não são comprovados."
            :territorial.cadastralLink==="unverified"
              ?"O vínculo ao cadastro imobiliário não pôde ser verificado. Não presumir zona pela planta ou pelo endereço."
              :territorial.zoneVerified
                ?"Perímetro do imóvel conferido no mapa municipal validado. A lei e o atendimento aos índices ainda exigem revisão."
                :"Imóvel vinculado ao cadastro. O endereço e a zona declarada ainda dependem de confirmação cartográfica e legal."}
        </p>
        {territorial.address?<p className="mt-1 break-words text-xs">Endereço cadastral informado: {territorial.address}</p>:null}
        <p className="mt-1 text-xs">Zona declarada no cadastro: <strong>{territorial.zoneCandidate||"não informada"}</strong>.
          Zona geográfica pelo mapa revisado: <strong>{territorial.zoneVerified?territorial.zoneCode:"não verificada"}</strong>.</p>
        {territorial.zoneVerified?<p className="mt-1 break-words text-xs">
          Fonte cartográfica: {territorial.mapLegalReference} · {territorial.mapVersion}
          · SHA-256 mapa {territorial.mapSha256.slice(0,12)}…
        </p>:null}
        <p className="mt-1 text-xs leading-5">A leitura de cotas não identifica, por si só,
          a localização legal do lote. É necessário cruzamento com cadastro municipal,
          mapa oficial georreferenciado e normas vigentes.</p>
        </div>
      </details>:null}
      {legalBaseline?<section data-sigapro-existing-legal-baseline="true"
        className="mt-3 min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 text-slate-900 shadow-sm dark:border-slate-600 dark:bg-[#1a3049] dark:text-white [overflow-wrap:anywhere]">
        <details data-sigapro-legal-history-details="true">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-[13px] font-extrabold text-slate-950 dark:text-white">
            <span>Base urbanística recuperada</span>
            <span className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-950 dark:bg-sky-900 dark:text-white">
              {legalBaseline.quadroI.reviewed}/{legalBaseline.quadroI.rows} · {legalBaseline.quadroII.draftEntries} rascunhos
            </span>
          </summary>
          <div className="mt-3 border-t border-slate-200 pt-2 text-[13px] leading-5 dark:border-slate-600">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Histórico existente no Neon — sem perda de conferências</p>
        <p className="mt-1 text-xs leading-5">
          Quadro I: <strong>{legalBaseline.quadroI.reviewed}/{legalBaseline.quadroI.rows}</strong> leituras conferidas;
          {" "}{legalBaseline.quadroI.needsCorrection} ressalva(s). Quadro II:
          {" "}<strong>{legalBaseline.quadroII.draftEntries}</strong> rascunhos em
          {" "}{legalBaseline.quadroII.pages} página(s) preservadas.
        </p>
        {legalBaseline.documents.length>0?<p className="mt-1 break-words text-xs leading-5">
          PDFs registrados: {legalBaseline.documents.map(item=>item.name).join(" · ")}.
          A referência cadastral não comprova, sozinha, a abertura do objeto no R2.
        </p>:<p className="mt-1 text-xs">Sem referências PDF confirmadas neste acervo; verifique a configuração municipal.</p>}
        <p className="mt-1 text-xs leading-5">
          Normas reais ativas: <strong>{legalBaseline.activeRealRegulations}</strong>.
          Evidências jurídicas por zona/uso: <strong>{legalBaseline.verifiedLegalScopes}</strong>.
          A leitura de projeto NÃO converte rascunhos nem trechos OCR em norma vigente.
        </p>
        {legalBaseline.quadroI.sourceDocument?
          <p className="mt-1 text-[11px]">Origem da matriz: {legalBaseline.quadroI.sourceDocument} · SHA-256
            {" "}{legalBaseline.quadroI.sourceSha256.slice(0,14)}…</p>:null}
          </div>
        </details>
      </section>:null}
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
      {loading?<div role="status" data-sigapro-ai-loading-stage="true"
        className="mt-3 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-950 dark:border-sky-600 dark:bg-[#19354d] dark:text-white">
        <div className="min-w-0">
          <p className="text-[13px] font-bold">Leitura em andamento</p>
          <p className="mt-1 text-xs leading-5">Verificando o PDF e as evidências. A operação tem limite de tempo e pode ser cancelada sem alterar o processo.</p>
        </div>
        <Button type="button" variant="outline" data-sigapro-ai-cancel-reading="true"
          className="min-h-10 shrink-0 border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
          onClick={cancelScan}>Cancelar</Button>
      </div>:null}
      <Button type="button" data-sigapro-ai-read-project="true"
        className="mt-3 h-auto min-h-12 min-w-0 max-w-full whitespace-normal break-words bg-[#092742] px-4 py-2 text-[13px] font-extrabold !text-white shadow-sm hover:bg-[#124a70] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:!text-slate-700 disabled:opacity-100 dark:disabled:bg-slate-700 dark:disabled:!text-white [overflow-wrap:anywhere]"
        disabled={readOnly||(readingMode!=="native_text"&&!consent)||!latest||loading||
          !readyForSelectedMode||availability.documentReady!==true}
        onClick={()=>void scan()}>
        {loading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileText className="mr-2 h-4 w-4"/>}
        {loading
          ? readingMode==="native_text"?"SIGAPRO · Lendo cotas no PDF...":
            readingMode==="cloudflare_text"?"SIGAPRO IA · Extraindo texto...":
            readingMode==="openai_visual"?"SIGAPRO IA · Examinando PDF em alta definição...":
            readingMode==="gemini_qa"?"SIGAPRO IA · Testando planta fictícia...":"SIGAPRO IA · Analisando prancha..."
          : readingMode==="native_text"?"Ler cotas do PDF sem IA":
            readingMode==="cloudflare_text"?"Extrair texto com SIGAPRO IA":
            readingMode==="openai_visual"?"Analisar PDF com Leitura Avançada":
            readingMode==="gemini_qa"?"Executar ensaio visual do projeto 04":"Analisar prancha com SIGAPRO IA"}
      </Button>
    </>}
    {error?<div data-sigapro-ai-reading-error="true"
      className="mt-3 min-w-0 max-w-full rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs leading-5 text-rose-950 dark:border-rose-600 dark:bg-rose-950 dark:text-rose-100 [overflow-wrap:anywhere]">
      <p role="alert" className="break-words font-semibold">{error}</p>
      {(errorCode.startsWith("CLOUDFLARE_")||billingUnavailable)&&availability.nativeTextAvailable?
        <Button type="button" variant="outline" data-sigapro-ai-fallback-local-action="true"
          className="mt-3 h-auto min-h-11 w-full whitespace-normal rounded-xl border-sky-300 bg-white px-3 py-2 text-[13px] font-bold text-sky-950 hover:bg-sky-50"
          onClick={()=>changeReadingMode("native_text")}>
          Usar Leitura Local de Cotas (sem custo externo)
        </Button>:null}
      {errorCode?<details className="mt-2 text-[11px]">
        <summary className="cursor-pointer font-semibold underline-offset-2">
          Detalhes técnicos para o suporte
        </summary>
        <code data-sigapro-ai-diagnostic-code="true" className="mt-1 block break-all">{errorCode}</code>
      </details>:null}
    </div>:null}
    {draft? <div className="mt-4 space-y-3">
      <p data-sigapro-ai-metrics-summary="true"
        className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13px] font-semibold text-slate-900 dark:border-slate-600 dark:bg-[#1a3049] dark:text-white">
        {draft.readings.filter(row=>row.value!==null&&row.usableForReview).length} de {draft.readings.length}
        {" "}medidas com evidência aproveitável para conferência humana · decisão urbanística não avaliada
      </p>
      <section data-sigapro-pdf-page-audit="true"
        className="min-w-0 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sky-950 dark:border-sky-600 dark:bg-[#122d43] dark:text-white [overflow-wrap:anywhere]">
        <p className="text-sm font-extrabold">Inventário de páginas do projeto</p>
        <p className="mt-1 text-xs leading-5">
          {draft.pageAudit?.countVerified
            ? "PDF: "+draft.pageAudit.count+" página(s) · Medidas com evidência citada em "+
                draft.pageAudit.evidencePages.length+" página(s)."
            : "Número de páginas não comprovado por esta leitura; confira o PDF original."}
        </p>
        {draft.pageAudit?.countVerified&&draft.pageAudit.pagesWithoutMeasurementEvidence.length>0?
          <p className="mt-1 text-xs leading-5">
            Páginas sem medidas comprovadas: {draft.pageAudit.pagesWithoutMeasurementEvidence
              .slice(0,15).join(", ")}
            {draft.pageAudit.pagesWithoutMeasurementEvidence.length>15?" e outras":""}.
            Elas não foram descartadas: exigem revisão da prancha original.
          </p>:null}
        <p className="mt-1 text-xs leading-5">
          {draft.pageAudit?.note||
            "Não existe certificado de inspeção integral da geometria. Cada prancha deve ser revisada pelo analista."}
        </p>
      </section>
      <div data-sigapro-reading-report="true"
        className="min-w-0 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sky-950 dark:border-sky-600 dark:bg-[#103b5e] dark:text-white">
        <p className="text-sm font-extrabold">Relatório técnico da leitura</p>
        <p className="mt-1 break-words text-xs leading-5">
          Gere um PDF rastreável com todas as medidas, páginas, trechos e pendências desta versão
          do projeto. É um relatório preliminar de extração, sem avaliação de zoneamento e sem aprovação automática.
        </p>
        <Button type="button" data-sigapro-download-reading-report="true"
          className="mt-2 h-auto min-h-11 w-full whitespace-normal break-words bg-slate-950 px-3 py-2 !text-white"
          disabled={!latest||readOnly||draft.documentVersion!==selected?.version}
          onClick={()=>void downloadReadingReport()}>
          <FileText className="mr-2 h-4 w-4"/>Gerar relatório da leitura (PDF)
        </Button>
      </div>
      {draft.source==="pdf_text_local"?<p role="status"
        data-sigapro-native-pdf-evidence="true"
        className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100">
        Extração local feita diretamente dos textos do arquivo PDF. Não é inferência de IA,
        não avalia desenhos não textuais e não determina aprovação urbanística.
      </p>:null}
      {draft.source==="ai_pdf_text"?<p role="status"
        className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
        A Leitura Documental converteu o PDF em texto. Recuos e geometria não foram
        validados: somente trechos verificáveis podem ser conferidos no PDF original.
      </p>:null}
      {(readingMode==="gemini_qa"&&draft.aiProvider==="gemini")||
        (readingMode==="native_text"&&draft.aiProvider==="sigapro_local")?(
        <section data-sigapro-qa04-benchmark="true"
          className="min-w-0 max-w-full rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-500 dark:bg-[#103b5e] dark:text-sky-100 [overflow-wrap:anywhere]">
          <strong className="block text-sm">Conferência do ensaio fictício · QA04</strong>
          <p className="mt-1">
            {benchmarkQa04ArchitecturalReadings(draft.readings).passed} de 3 recuos
            identificados corretamente na página 2, com citação e unidade
            {readingMode==="native_text"?" (extração textual local, sem IA).":" (leitura visual por IA)."}
          </p>
          {benchmarkQa04ArchitecturalReadings(draft.readings).cases.map(item=>(
            <p key={item.metric} className="mt-1 break-words">
              {item.verified?"✓":"–"} {item.label}: esperado {item.expected.toFixed(2).replace(".",",")} m
              · lido {item.readValue===null?"não comprovado":item.readValue.toFixed(2).replace(".",",")+" m"}
              {item.readPage!==null?" · página "+item.readPage:""}.
            </p>
          ))}
          <p className="mt-2 font-semibold">
            Teste de extração documental fictícia: não comprova precisão em projetos reais
            e não valida zoneamento, legislação ou aprovação municipal.
          </p>
        </section>
      ):null}
      <details data-sigapro-ai-evidence-alerts="true"
        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 text-slate-900 shadow-sm dark:border-slate-600 dark:bg-[#1a3049] dark:text-white [overflow-wrap:anywhere]">
        <summary className="cursor-pointer text-[13px] font-extrabold text-slate-950 dark:text-white">
          Alertas da leitura · {draft.warnings.length} aviso(s)
        </summary>
        <p className="mt-2 text-[13px] leading-5">
          {draft.documentType==="architectural_plan"?"Projeto reconhecido":"Documento não confirmado"} ·
          Implantação {draft.hasSitePlan?"identificada":"não confirmada"} · conformidade jurídica não avaliada.
        </p>
        {draft.warnings.map((warning,i)=><p key={i} className="mt-2 flex gap-2 text-[13px] leading-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-200"/>{warning}
        </p>)}
      </details>
      <div className={`grid min-w-0 gap-2 ${compact?"grid-cols-1":"md:grid-cols-2"}`}>
        {draft.readings.map(row=>{
          const meta=URBAN_METRICS.find(m=>m.key===row.metric)!;
          const canUse=row.usableForReview && activeMetrics.includes(row.metric) &&
            !readOnly && draft.documentId===id;
          return <div key={row.metric}
            data-sigapro-pdf-measure={row.metric}
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 text-slate-900 shadow-sm dark:border-slate-600 dark:bg-[#1a3049] dark:text-slate-100 [overflow-wrap:anywhere]">
            <strong className="text-xs text-slate-950 dark:text-white">{meta.label}</strong>
            <p className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
              {row.value===null?"Não identificado":String(row.value)+" "+meta.unit}
            </p>
            {row.page!==null?<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-100">
              <span>Página {row.page} · {row.confidence==="high"?"cota identificada":"conferir cota"}</span>
              {onGoToPage?<button type="button" data-sigapro-ai-go-to-page={row.page}
                className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 font-bold text-sky-950 hover:bg-sky-100 dark:border-sky-500 dark:bg-[#163b5b] dark:text-white"
                onClick={()=>onGoToPage(row.page!)}>Abrir prancha</button>:null}
            </div>:null}
            {row.quote?<details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-600 dark:bg-[#22364d]">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-100">Ver citação original</summary>
              <p className="mt-2 break-words text-[13px] italic leading-5 text-slate-800 dark:text-white">
                “{row.quote}”
              </p>
            </details>:null}
            {!row.usableForReview?<details className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-950 dark:border-amber-700 dark:bg-[#3a2d1d] dark:text-amber-100">
              <summary className="cursor-pointer text-xs font-semibold">Por que ainda não foi confirmado?</summary>
              <p className="mt-1 text-[13px] leading-5">{row.reason}</p>
            </details>:null}
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
