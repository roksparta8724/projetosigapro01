import {useEffect,useRef,useState} from "react";
import {FileText,Loader2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {backendClient} from "@/integrations/backend/databaseClient";
type Benchmark={
 kind:"sigapro.qa04.synthetic-pdf.v1";status:"passed"|"needs_review";
 summary:{passed:number;total:number;pagesRead:number};
 cases:Array<{metric:string;label:string;expected:number;readValue:number|null;readPage:number|null;verified:boolean}>;
 legalConformity:"not_evaluated";processUpdated:false;providerRequests:0;
};
/** Independent QA-only test; never invokes onApply or accepts process identifiers. */
export function QaArchitecturalLab(){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [report,setReport]=useState<Benchmark|null>(null);
 const current=useRef<AbortController|null>(null);
 useEffect(()=>()=>current.current?.abort(),[]);
 async function run(){
  if(busy)return;
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
 return <details data-sigapro-qa-lab="true"
  className="mt-3 min-w-0 rounded-xl border border-sky-300 bg-white p-3 text-slate-900 dark:border-sky-600 dark:bg-[#162e49] dark:text-white">
  <summary className="cursor-pointer text-sm font-extrabold">
   Laboratório QA · ensaio isolado sem triagem
  </summary>
  <p className="mt-2 text-xs leading-5">
   Usa somente PDF fictício de 3 pranchas criado em memória. Nenhum documento do processo
   é aberto, nenhuma guia é paga, nenhum status é alterado e não há chamada a IA externa.
  </p>
  <Button type="button" data-sigapro-qa-lab-run="true" disabled={busy}
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
 </details>;
}
