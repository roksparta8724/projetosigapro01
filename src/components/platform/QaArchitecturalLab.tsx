import {useEffect,useRef,useState} from "react";
import {FileText,Loader2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {backendClient} from "@/integrations/backend/databaseClient";
import {benchmarkQa04ArchitecturalReadings,type DrawingReading} from "@/lib/architecturalPdfReadings";
type Benchmark={
 kind:"sigapro.qa04.synthetic-pdf.v1";status:"passed"|"needs_review";
 summary:{passed:number;total:number;pagesRead:number};
 cases:Array<{metric:string;label:string;expected:number;readValue:number|null;readPage:number|null;verified:boolean}>;
 legalConformity:"not_evaluated";processUpdated:false;providerRequests:0;
};
/** QA-only non-mutating probes. Stored PDF access uses the normal analyst ACL. */
const QA_MUNICIPALITY="49dac0b6-6352-4744-9aab-9ff91c59d970";
const QA_PROCESS="915e1c63-ebda-4cdd-8e95-34316d9e0089";
const QA_DOCUMENT="ad0fb7f4-2b0f-43a4-8e9e-885af20863ec";
type StoredReport=ReturnType<typeof benchmarkQa04ArchitecturalReadings> & {
  pages:number|null;pagesVerified:boolean;
};
export function QaArchitecturalLab({municipalityId}:{municipalityId?:string|null}={}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [report,setReport]=useState<Benchmark|null>(null);
 const current=useRef<AbortController|null>(null);
 const storedController=useRef<AbortController|null>(null);
 const [storedBusy,setStoredBusy]=useState(false);
 const [storedError,setStoredError]=useState("");
 const [storedReport,setStoredReport]=useState<StoredReport|null>(null);
 useEffect(()=>()=>{current.current?.abort();storedController.current?.abort();},[]);
 async function run(){
  if(busy||storedBusy)return;
  setBusy(true);setError("");setReport(null);
  const ctrl=new AbortController();current.current=ctrl;
  const timer=setTimeout(()=>ctrl.abort(),20000);
  try{
   const session=(await backendClient.auth.getSession()).data?.session;
   const jwt=session?.access_token||session?.accessToken||session?.token||"";
   if(!jwt)throw new Error("Sessão expirada. Entre novamente.");
   const resp=await fetch("/api/ai-assistant?action=qa-architectural-benchmark",{
    method:"POST",cache:"no-store",signal:ctrl.signal,
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+jwt},body:"{}",
   });
   const x=await resp.json() as Partial<Benchmark>&{error?:string};
   if(!resp.ok)throw new Error(x.error||"O laboratório não concluiu a leitura.");
   if(x.kind!=="sigapro.qa04.synthetic-pdf.v1"||x.status!=="passed"||
      x.legalConformity!=="not_evaluated"||x.processUpdated!==false||
      x.providerRequests!==0||x.summary?.total!==3||x.cases?.length!==3||
      !x.cases.every(item=>item.verified&&item.readPage===2))
     throw new Error("Resultado de ensaio inconsistente. Nenhuma medida foi aplicada.");
   if(!ctrl.signal.aborted)setReport(x as Benchmark);
  }catch(e){setError(ctrl.signal.aborted?"Tempo de ensaio excedido sem alterar o processo.":
     String((e as Error)?.message||e));}
  finally{clearTimeout(timer);if(current.current===ctrl){current.current=null;setBusy(false);}}
 }
 async function readStored(){
  if(busy||storedBusy||municipalityId!==QA_MUNICIPALITY)return;
  setStoredBusy(true);setStoredError("");setStoredReport(null);
  const ctrl=new AbortController();storedController.current=ctrl;
  const timer=setTimeout(()=>ctrl.abort(),65000);
  try{
   const session=(await backendClient.auth.getSession()).data?.session;
   const jwt=session?.access_token||session?.accessToken||session?.token||"";
   if(!jwt)throw new Error("Sessão expirada. Entre novamente no SIGAPRO.");
   const headers={Authorization:"Bearer "+jwt};
   const query=new URLSearchParams({action:"project-extract",
     processId:QA_PROCESS,documentId:QA_DOCUMENT});
   const preflight=await fetch("/api/ai-assistant?"+query.toString(),{
     method:"GET",cache:"no-store",headers,signal:ctrl.signal,
   });
   const status=await preflight.json() as {error?:string;documentMessage?:string;
     documentReady?:boolean;nativeTextAvailable?:boolean};
   if(!preflight.ok||status.documentReady!==true||status.nativeTextAvailable!==true)
     throw new Error(status.error||status.documentMessage||
       "O projeto arquivado não foi liberado para análise técnica.");
   const response=await fetch("/api/ai-assistant?action=project-extract",{
     method:"POST",cache:"no-store",signal:ctrl.signal,
     headers:{...headers,"Content-Type":"application/json"},
     // Existing API requires a positive action flag even for local reading;
     // native_text never transfers the PDF to an external AI provider.
     body:JSON.stringify({processId:QA_PROCESS,documentId:QA_DOCUMENT,
       confirmedTransfer:true,readingMode:"native_text"}),
   });
   const parsed=await response.json() as {
     error?:string;processId?:string;documentId?:string;documentVersion?:number;
     source?:string;aiProvider?:string;automaticallyApproved?:boolean;
     pdfSharedWithConfiguredAiProvider?:boolean;humanReviewRequired?:boolean;
     legalConformity?:string;readings?:DrawingReading[];
     pageAudit?:{count:number|null;countVerified:boolean};
   };
   if(!response.ok)throw new Error(parsed.error||"Não foi possível ler o PDF armazenado no R2.");
   if(parsed.processId!==QA_PROCESS||parsed.documentId!==QA_DOCUMENT||
     parsed.documentVersion!==2||parsed.source!=="pdf_text_local"||
     parsed.aiProvider!=="sigapro_local"||parsed.automaticallyApproved!==false||
     parsed.pdfSharedWithConfiguredAiProvider!==false||
     parsed.humanReviewRequired!==true||parsed.legalConformity!=="not_evaluated"||
     !Array.isArray(parsed.readings))
     throw new Error("Identidade ou modalidade da leitura arquivada não comprovada.");
   const checks=benchmarkQa04ArchitecturalReadings(parsed.readings);
   if(!ctrl.signal.aborted)setStoredReport({...checks,
     pages:parsed.pageAudit?.count??null,
     pagesVerified:parsed.pageAudit?.countVerified===true});
  }catch(e){
   setStoredError(ctrl.signal.aborted
     ?"A leitura do R2 excedeu o tempo máximo. Nenhuma medida foi registrada."
     :String((e as Error)?.message||e));
  }finally{
   clearTimeout(timer);
   if(storedController.current===ctrl){storedController.current=null;setStoredBusy(false);}
  }
 }
 return <details data-sigapro-qa-lab="true"
  className="mt-3 min-w-0 rounded-xl border border-sky-300 bg-white p-3 text-slate-900 dark:border-sky-600 dark:bg-[#162e49] dark:text-white">
  <summary className="cursor-pointer text-sm font-extrabold">
   Laboratório QA · ensaio isolado sem triagem
  </summary>
  <p className="mt-2 text-xs leading-5">
   Usa somente PDF fictício de 3 pranchas criado em memória. Nenhum documento do processo
   é aberto, nenhuma guia é paga, nenhum status é alterado e não há chamada a IA externa.
  </p>
  <Button type="button" data-sigapro-qa-lab-run="true" disabled={busy||storedBusy}
   className="mt-3 h-auto min-h-11 w-full whitespace-normal bg-[#0b3150] px-3 py-2 text-xs font-bold !text-white"
   onClick={()=>void run()}>
   {busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileText className="mr-2 h-4 w-4"/>}
   {busy?"Lendo PDF fictício...":"Executar leitura de teste sem créditos"}
  </Button>
  {error?<p role="alert" className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-200">{error}</p>:null}
  {report?<div data-sigapro-qa-lab-result="true"
   className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-950 dark:border-sky-600 dark:bg-[#103b5e] dark:text-white">
   <p className="text-sm font-extrabold">{report.summary.passed} de {report.summary.total} recuos
    identificados · {report.summary.pagesRead} páginas do PDF</p>
   {report.cases.map(item=><p key={item.metric} className="mt-1 break-words text-xs">
    {item.verified?"✓":"—"} {item.label}: esperado {item.expected.toFixed(2).replace(".",",")} m
    · lido {item.readValue===null?"não localizado":item.readValue.toFixed(2).replace(".",",")+" m"}
    {item.readPage!==null?" · página "+item.readPage:""}
   </p>)}
   <p className="mt-2 text-xs font-semibold">
    Ensaio da extração textual local, não é leitura visual por IA nem aprovação legal.
    Nenhum resultado é transferido ao processo.
   </p>
  </div>:null}
  {municipalityId===QA_MUNICIPALITY?(
   <section data-sigapro-qa04-stored-pdf="true"
    className="mt-3 rounded-xl border border-sky-200 bg-[#f0f7fc] p-3 text-slate-950 dark:border-sky-700 dark:bg-[#193852] dark:text-white">
    <h4 className="text-[13px] font-extrabold">Prova do PDF efetivamente arquivado no R2</h4>
    <p className="mt-1 text-xs leading-5">
     Processo fictício 04 · versão 2. Primeiro verifica as permissões do analista;
     depois lê os bytes do documento armazenado pelo leitor local sem créditos de IA.
     Não modifica processo, pagamento ou lei municipal.
    </p>
    <Button type="button" data-sigapro-qa04-stored-run="true"
      disabled={busy||storedBusy}
      onClick={()=>void readStored()}
      className="mt-3 h-auto min-h-11 w-full whitespace-normal rounded-lg bg-[#0b3150] px-3 py-2 text-xs font-extrabold !text-white">
     {storedBusy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileText className="mr-2 h-4 w-4"/>}
     {storedBusy?"Conferindo permissão e arquivo R2...":"Testar PDF arquivado no R2 (sem IA paga)"}
    </Button>
    {storedError?<p role="alert" className="mt-2 break-words rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs font-semibold text-rose-900 dark:border-rose-500 dark:bg-[#47202a] dark:text-white">{storedError}</p>:null}
    {storedReport?<div data-sigapro-qa04-stored-result="true"
      className="mt-3 rounded-lg border border-sky-200 bg-white p-3 text-slate-950 dark:border-sky-600 dark:bg-[#103b5e] dark:text-white">
     <strong className="text-sm">{storedReport.passed}/{storedReport.total} recuos lidos do R2</strong>
     <p className="mt-1 text-xs">{storedReport.pagesVerified
       ?storedReport.pages+" páginas estruturais comprovadas":"Número de páginas não comprovado"}</p>
     {storedReport.cases.map(item=><p key={item.metric} className="mt-1 break-words text-xs">
       {item.verified?"✓":"—"} {item.label}: esperado {item.expected.toFixed(2).replace(".",",")} m;
       lido {item.readValue===null?"não confirmado":item.readValue.toFixed(2).replace(".",",")+" m"}
       {item.readPage!==null?" · prancha "+item.readPage:""}
     </p>)}
     <p className="mt-2 text-xs font-semibold">
      Ensaio técnico de PDF fictício. Guia e anexos jurídicos desta fixture
      não são pagamentos ou documentos oficiais. Nenhuma medida foi aplicada ao processo.
     </p>
    </div>:null}
   </section>
  ):null}
 </details>;
}
