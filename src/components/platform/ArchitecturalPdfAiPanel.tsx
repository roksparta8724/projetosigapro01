import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backendClient } from "@/integrations/backend/databaseClient";
import { makeReviewedDrawingEvidence, type DrawingExtraction } from "@/lib/architecturalPdfReadings";
import { URBAN_METRICS, type UrbanMetric } from "@/lib/urbanPrecheck";
import type { ProcessRecord } from "@/lib/platform";

type Prepared = Partial<Record<UrbanMetric,{value:string;evidence:string}>>;
type ApiResult = DrawingExtraction & {
  processId:string; documentId:string; documentVersion:number; fileName:string;
  legalConformity:"not_evaluated"; humanReviewRequired:true;
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
  const [loading,setLoading]=useState(false);
  const [availability,setAvailability]=useState<{
    status:"checking"|"ready"|"disabled";message:string;
  }>({status:"checking",message:"Verificando se o provedor de IA está configurado..."});

  const [error,setError]=useState("");
  const [draft,setDraft]=useState<ApiResult|null>(null);
  const [checked,setChecked]=useState<Partial<Record<UrbanMetric,boolean>>>({});
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    setId(plans[0]?.id||"");setConsent(false);
    setDraft(null);setChecked({});setError("");setNotice("");
  },[process.id,plans[0]?.id]);

  useEffect(()=>{
    let current=true;
    if(readOnly){
      setAvailability({status:"disabled",message:"A leitura visual está disponível apenas para o analista autorizado."});
      return;
    }
    setAvailability({status:"checking",message:"Verificando provedor visual da homologação..."});
    void (async()=>{
      const session=(await backendClient.auth.getSession()).data?.session;
      const jwt=session?.access_token||session?.accessToken||session?.token||"";
      if(!jwt)throw new Error("Sessão expirada. Entre novamente no SIGAPRO.");
      const res=await fetch("/api/ai-assistant?action=project-extract",{
        method:"GET",cache:"no-store",headers:{Authorization:"Bearer "+jwt},
      });
      const value=await res.json() as {enabled?:boolean;message?:string;error?:string};
      if(!res.ok)throw new Error(value.error||"Não foi possível confirmar a disponibilidade da IA.");
      if(current)setAvailability({status:value.enabled?"ready":"disabled",
        message:value.message||"Leitor visual indisponível."});
    })().catch((err:unknown)=>{
      if(current)setAvailability({status:"disabled",
        message:String((err as Error)?.message||err)});
    });
    return()=>{current=false;};
  },[process.id,readOnly]);

  const selected=plans.find(doc=>doc.id===id);
  const latest=plans[0]?.id===id;
  const applied=draft?.readings.filter(row=>
    row.usableForReview && checked[row.metric] &&
    activeMetrics.includes(row.metric))||[];
  async function scan(){
    if(readOnly||!selected||!latest||!consent||loading||availability.status!=="ready")return;
    setDraft(null);setChecked({});setError("");setNotice("");setLoading(true);
    try{
      const session=(await backendClient.auth.getSession()).data?.session;
      const jwt=session?.access_token||session?.accessToken||session?.token||"";
      if(!jwt)throw new Error("Sessão expirada. Entre novamente no SIGAPRO.");
      const response=await fetch("/api/ai-assistant?action=project-extract",{
        method:"POST",cache:"no-store",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+jwt},
        body:JSON.stringify({processId:process.id,documentId:selected.id,confirmedTransfer:true}),
      });
      const result=await response.json() as Partial<ApiResult>&{error?:string;code?:string};
      if(!response.ok)throw new Error(result.error||"Não foi possível ler o projeto.");
      if(result.processId!==process.id||result.documentId!==selected.id||
        result.documentVersion!==selected.version||
        !Array.isArray(result.readings)||result.source!=="ai_pdf_visual"||
        result.automaticallyApproved!==false||result.legalConformity!=="not_evaluated")
        throw new Error("Leitura retornada com vínculo incorreto. Nenhuma medida foi aplicada.");
      setDraft(result as ApiResult);
      setNotice("Extração concluída. Confira cada página original antes de aproveitar uma medida.");
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
        Leitor visual do projeto arquitetônico — versão de homologação
      </h4>
      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-950">
        Sem aprovação automática
      </span>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
      Lê cotas e quadros de áreas do PDF por IA visual e apresenta a página de origem.
      A leitura pode errar: cada valor deve ser comparado com a prancha original
      antes de entrar no diagnóstico normativo.
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
      <label className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-950 dark:border-sky-700 dark:bg-slate-900 dark:text-white">
        <input type="checkbox" checked={consent} disabled={readOnly||loading}
          onChange={event=>setConsent(event.target.checked)} />
        Autorizo o envio deste PDF ao provedor de IA configurado, exclusivamente para
        extração assistida das cotas. Sei que a IA pode interpretar a planta incorretamente
        e que nenhuma decisão nem mudança de processo será automática.
      </label>
      <p role="status" data-sigapro-ai-pdf-provider-status={availability.status}
        className={"mt-3 text-xs font-semibold leading-5 "+(
          availability.status==="ready"?"text-emerald-800 dark:text-emerald-300":
          "text-amber-800 dark:text-amber-200")}>
        {availability.message}
      </p>
      <Button type="button" data-sigapro-ai-read-project="true"
        className="mt-3 min-h-11 bg-slate-950 !text-white"
        disabled={readOnly||!consent||!latest||loading||availability.status!=="ready"}
        onClick={()=>void scan()}>
        {loading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileText className="mr-2 h-4 w-4"/>}
        {loading?"Lendo prancha com IA...":"Ler projeto arquitetônico com IA"}
      </Button>
    </>}
    {error?<p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900 dark:bg-slate-900 dark:text-rose-100">
      {error}
    </p>:null}
    {draft? <div className="mt-4 space-y-3">
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
