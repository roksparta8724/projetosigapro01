import {useState} from "react";
import {AlertTriangle,CheckCircle2,FileSearch,Loader2} from "lucide-react";
import {UrbanPdfPageCanvas} from "./UrbanPdfPageCanvas";
import {inspectArchitecturalProjectPdf,type ProjectPdfInspection} from "@/lib/urbanProjectPdfReader";
import {URBAN_METRICS,type UrbanMetric} from "@/lib/urbanPrecheck";
import type {ProjectMeasure} from "@/lib/urbanArchitecturalMeasures";
import type {ProcessDocument} from "@/lib/platform";
import {getSignedUrlForObjectStrict} from "@/integrations/r2/client";

type Props={
 readOnly:boolean;allowedMetrics:UrbanMetric[];
 documents:ProcessDocument[];
 onConfirm:(item:ProjectMeasure,source:{fileName:string;sha256:string})=>void;
};
const label=(metric:UrbanMetric)=>URBAN_METRICS.find(m=>m.key===metric)?.label||metric;
/** No PDF is uploaded to AI or server. Reviewer must confirm each measurement. */
export function UrbanProjectReaderPanel({readOnly,allowedMetrics,documents,onConfirm}:Props){
 const [file,setFile]=useState<File|null>(null);
 const [storedDocumentId,setStoredDocumentId]=useState("");
 const candidateDocuments=documents.filter(item=>item.uploaded&&item.filePath&&
   (item.mimeType==="application/pdf"||/\.pdf$/i.test(item.fileName||"")) &&
   (item.fileSizeBytes===undefined||item.fileSizeBytes<=80*1024*1024));
 const [report,setReport]=useState<ProjectPdfInspection|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [chosen,setChosen]=useState<UrbanMetric|null>(null);
 const [ack,setAck]=useState(false);
 const [displayPage,setDisplayPage]=useState(1);
 const [applied,setApplied]=useState<UrbanMetric[]>([]);
 const inspectStored=async()=>{
   if(busy||readOnly)return;
   const original=candidateDocuments.find(d=>d.id===storedDocumentId);
   if(!original||!original.filePath)return;
   setBusy(true);setReport(null);setError("");setChosen(null);setAck(false);setApplied([]);
   try{
     // Existing server-side signed-url endpoint verifies the current user's
     // right to the process document. Never construct a public R2 URL.
     const bucket=(import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string|undefined)||"sigapro-documentos";
     const signed=await getSignedUrlForObjectStrict({
       bucket,objectKey:original.filePath,expiresIn:300,
     });
     if(!signed||!signed.startsWith("https://"))throw Error("Não foi autorizado acesso seguro ao anexo.");
     const response=await fetch(signed,{method:"GET",mode:"cors",redirect:"error"});
     if(!response.ok)throw Error("Falha ao abrir o PDF anexado (HTTP "+response.status+").");
     const bytesExpected=Number(response.headers.get("content-length")||"0");
     if(bytesExpected>80*1024*1024)throw Error("PDF anexado excede o limite de 80 MB.");
     const blob=await response.blob();
     if(blob.size>80*1024*1024||blob.size<5)throw Error("PDF anexado inválido ou acima de 80 MB.");
     const filename=/\.pdf$/i.test(original.fileName||"")
       ?original.fileName!:(original.label||"projeto")+"-documento.pdf";
     const loaded=new File([blob],filename,{type:"application/pdf"});
     const inspected=await inspectArchitecturalProjectPdf(loaded);
     if(original.fileHash && /^[a-f0-9]{64}$/i.test(original.fileHash) &&
       inspected.sha256.toLowerCase()!==original.fileHash.toLowerCase())
       throw Error("INTEGRIDADE: SHA-256 diferente do arquivo oficialmente anexado. Leitura bloqueada.");
     if(original.fileHash&&!/^[a-f0-9]{64}$/i.test(original.fileHash))
       inspected.warnings.unshift("O anexo não possui SHA-256 cadastrado em formato verificável. Confira a versão no processo.");
     setFile(loaded);setReport(inspected);
     setDisplayPage(inspected.proposals[0]?.page||1);
   }catch(error){
     setFile(null);setReport(null);
     setError((error instanceof Error?error.message:"Não foi possível acessar o documento")+
       " Se houver problema com CORS do armazenamento, baixe o PDF na aba Documentos e selecione-o localmente.");
   }finally{setBusy(false);}
 };
 const inspect=async()=>{
   if(!file||busy||readOnly)return;
   setBusy(true);setReport(null);setError("");setChosen(null);setAck(false);setApplied([]);
   try{
    const result=await inspectArchitecturalProjectPdf(file);
    setReport(result);
    setDisplayPage(result.proposals[0]?.page||1);
   }catch(err){setError(err instanceof Error?err.message:"PDF não pôde ser inspecionado.");}
   finally{setBusy(false);}
 };
 const picked=report?.proposals.find(p=>p.metric===chosen);
 return <section data-sigapro-real-project-pdf-reader="true"
   className="mt-4 rounded-2xl border border-sky-300 bg-sky-50/40 p-4 text-slate-950 dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100">
   <h4 className="flex items-center gap-2 text-sm font-extrabold">
     <FileSearch className="h-4 w-4"/> Leitura assistida de projeto arquitetônico em PDF
   </h4>
   <p className="mt-2 text-xs leading-5">
     Inspeciona localmente até 60 páginas do projeto, identifica valores declarados e apresenta
     páginas e trechos para conferência. NÃO mede geometria desenhada, nem faz OCR de imagens
     digitalizadas, nem aprova o projeto. Conflitos bloqueiam o preenchimento automático.
   </p>
   {candidateDocuments.length>0?<div data-urban-project-saved-documents="true"
     className="mt-3 rounded-xl border border-sky-200 bg-white p-3 text-slate-950">
     <p className="text-xs font-extrabold">Documentos já vinculados a este processo</p>
     <p className="mt-1 text-xs">Não é necessário anexar novamente. O acesso é autorizado pelo servidor.</p>
     <div className="mt-2 flex flex-wrap items-end gap-2">
       <label className="min-w-0 flex-1 text-xs font-bold">PDF armazenado no protocolo
         <select aria-label="Escolher PDF já anexado ao processo"
           value={storedDocumentId} disabled={busy||readOnly}
           onChange={e=>setStoredDocumentId(e.target.value)}
           className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950">
           <option value="">Selecione o projeto arquitetônico...</option>
           {candidateDocuments.map(item=><option key={item.id} value={item.id}>
             {item.fileName||item.label} — v{item.version}
           </option>)}
         </select>
       </label>
       <button type="button" data-urban-inspect-saved-project="true"
         disabled={!storedDocumentId||busy||readOnly}
         onClick={()=>void inspectStored()}
         className="sig-force-dark-action min-h-11 rounded-lg bg-sky-900 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
         {busy?"Lendo anexo…":"Ler documento do processo"}
       </button>
     </div>
   </div>:null}
   <div className="mt-3 flex flex-wrap items-end gap-2">
     <label className="min-w-0 flex-1 text-xs font-bold">Ou selecione um PDF local (até 80 MB)
       <input type="file" accept=".pdf,application/pdf" disabled={busy||readOnly}
         aria-label="PDF do projeto arquitetônico para leitura"
         onChange={event=>{setFile(event.target.files?.[0]||null);
           setReport(null);setError("");setChosen(null);setAck(false);setApplied([]);}}
         className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-950"/>
     </label>
     <button type="button" disabled={!file||busy||readOnly} onClick={()=>void inspect()}
       data-urban-inspect-project="true"
       className="sig-force-dark-action min-h-11 rounded-lg border border-sky-800 bg-sky-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
       {busy?<><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Lendo PDF…</>:"Analisar PDF do projeto"}
     </button>
   </div>
   {error?<p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-950">{error}</p>:null}
   {report?<div className="mt-4 space-y-3">
     <p className="text-xs font-semibold">
       {report.fileName} · {report.pagesRead}/{report.totalPages} páginas examinadas ·
       {" "}{report.proposals.length} medida(s) candidata(s) ·
       {" "}{report.conflicts.length} conflito(s). SHA-256: {report.sha256.slice(0,16)}…
     </p>
     {report.warnings.map((warning,i)=><p key={i} data-urban-pdf-inspection-warning="true"
       className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-950">
       <AlertTriangle className="mr-1 inline h-4 w-4"/>{warning}
     </p>)}
     {report.conflicts.length>0?<div data-urban-project-conflicts="true"
       className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-950">
       Medidas conflitantes — nenhuma delas será proposta automaticamente:
       {report.conflicts.map(c=><p key={c.metric} className="mt-2">
         {label(c.metric)}: {c.values.join(" / ")} · páginas {c.pages.join(", ")}
       </p>)}
     </div>:null}
     <div className="grid gap-2 lg:grid-cols-2">
       {report.proposals.map(item=><button type="button" key={item.metric}
         data-urban-project-candidate={item.metric}
         disabled={readOnly}
         onClick={()=>{setChosen(item.metric);setAck(false);setDisplayPage(item.page);}}
         className={"min-w-0 rounded-lg border p-3 text-left text-xs leading-5 "+
           (chosen===item.metric?"border-sky-600 bg-sky-100 text-sky-950":
            "border-slate-300 bg-white text-slate-900")}>
         <strong>{label(item.metric)} — {item.value}{URBAN_METRICS.find(x=>x.key===item.metric)?.unit||""}</strong>
         <span className="mt-1 block">Página {item.page} · {item.origin==="derived"?"Cálculo preliminar":"Valor declarado"}</span>
         <span className="mt-1 block break-words">{item.excerpt}</span>
       </button>)}
     </div>
     {picked&&file?<div data-urban-project-human-review="true"
       className="rounded-xl border border-sky-200 bg-white p-3 text-slate-950">
       <h5 className="text-xs font-extrabold">Conferência obrigatória — {label(picked.metric)}</h5>
       <UrbanPdfPageCanvas file={file} pageNumber={displayPage}/>
       <p className="mt-2 text-xs font-medium leading-5">Verifique as cotas, unidades e áreas da prancha.
         Uma declaração pode representar parâmetro legal, área existente ou área proposta.
         Nenhuma dessas possibilidades é presumida pelo leitor.</p>
       <label className="mt-2 flex items-start gap-2 text-xs font-semibold">
         <input type="checkbox" checked={ack} disabled={readOnly}
           data-urban-project-source-attested="true" onChange={e=>setAck(e.target.checked)}/>
         Conferi na página original que esta medida é do PROJETO analisado (não um limite de lei),
         corresponde ao índice selecionado e utiliza a unidade correta.
       </label>
       {allowedMetrics.includes(picked.metric)?
         <button type="button" data-urban-project-apply-confirmed="true"
           disabled={!ack||readOnly||applied.includes(picked.metric)}
           onClick={()=>{onConfirm(picked,{fileName:report.fileName,sha256:report.sha256});
              setApplied(prev=>[...prev,picked.metric]);setAck(false);}}
           className="sig-force-dark-action mt-3 min-h-11 rounded-lg bg-sky-900 px-4 py-2 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">
           {applied.includes(picked.metric)?"Medida encaminhada para revisão":"Aplicar medida conferida à pré-análise"}
         </button>:
         <p className="mt-2 text-xs font-bold text-amber-900">
           Este índice não possui norma ativa selecionada para a prefeitura/zona/uso/data.
           A medida permanece somente para conferência, sem lançamento.
         </p>}
     </div>:null}
     {applied.length>0?<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs font-bold text-emerald-950">
       <CheckCircle2 className="mr-1 inline h-4 w-4"/> Medidas conferidas transferidas:
       {" "}{applied.map(label).join(", ")}. Isso NÃO significa aprovação urbanística.
     </p>:null}
   </div>:null}
 </section>;
}
