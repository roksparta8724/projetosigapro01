/** Visualização local, fiel à página física do PDF, sem enviar arquivo ao servidor. */
import {useEffect,useRef,useState} from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type Props={file:File|null;pageNumber:number;reloadToken?:number};
type Phase="loading"|"ready"|"error";
export function UrbanPdfPageCanvas({file,pageNumber,reloadToken=0}:Props){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const [phase,setPhase]=useState<Phase>("loading");
  const [message,setMessage]=useState("Preparando prévia do PDF original…");
  useEffect(()=>{
    let disposed=false;
    let renderTask:{cancel:()=>void;promise:Promise<void>}|null=null;
    let loadingTask:{destroy:()=>Promise<void>}|null=null;
    if(!file||!Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>10000){
      setPhase("error");setMessage("Selecione um PDF e uma página física válida.");return;
    }
    setPhase("loading");setMessage("Renderizando a página física "+pageNumber+"…");
    const run=async()=>{
      try{
        const pdfjs=await import("pdfjs-dist");
        if(disposed)return;
        pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
        const bytes=new Uint8Array(await file.arrayBuffer());
        if(disposed)return;
        if(file.size>100*1024*1024||file.size<5||
          new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")
          throw Error("Arquivo PDF inválido ou acima de 100 MB.");
        const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,stopAtErrors:true});
        loadingTask=task;
        const pdf=await task.promise;
        if(disposed)return;
        if(pageNumber>pdf.numPages)throw Error("A página "+pageNumber+
          " não existe neste arquivo ("+pdf.numPages+" páginas).");
        const page=await pdf.getPage(pageNumber);
        if(disposed)return;
        const canvas=canvasRef.current;
        if(!canvas)throw Error("Leitor local não inicializado.");
        const base=page.getViewport({scale:1});
        const factor=Math.min(1.8,Math.sqrt(4_000_000/(base.width*base.height)));
        const viewport=page.getViewport({scale:Math.max(0.5,factor)});
        canvas.width=Math.max(1,Math.ceil(viewport.width));
        canvas.height=Math.max(1,Math.ceil(viewport.height));
        const ctx=canvas.getContext("2d",{alpha:false});
        if(!ctx)throw Error("O navegador não conseguiu mostrar esta página.");
        const active=page.render({canvasContext:ctx,viewport});
        renderTask=active;
        await active.promise;
        if(disposed)return;
        page.cleanup();
        setPhase("ready");setMessage("Página física "+pageNumber+" de "+pdf.numPages+" — PDF original.");
      }catch(err){
        if(disposed)return;
        setPhase("error");setMessage("Falha ao visualizar: "+
          (err instanceof Error?err.message:"formato incompatível")+
          ". Não valide índices sem consultar a página original.");
      }
    };
    void run();
    return()=>{
      disposed=true;
      renderTask?.cancel();
      if(loadingTask)void loadingTask.destroy().catch(()=>undefined);
    };
  },[file,pageNumber,reloadToken]);
  return <div data-urban-pdf-exact-canvas="true"
      className="mt-2 overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-950">
    <p data-urban-pdf-render-status="true" role="status" aria-live="polite"
      className={"px-3 py-2 text-sm font-bold "+(phase==="error"
        ?"bg-rose-50 text-rose-950":phase==="ready"
        ?"bg-sky-50 text-sky-950":"bg-slate-50 text-slate-800")}>{message}</p>
    <div className="max-h-[520px] overflow-auto bg-slate-100 p-2">
      <canvas ref={canvasRef} role="img" aria-label={"Página física "+pageNumber+" do PDF oficial"}
        className={phase==="ready"?"mx-auto h-auto max-w-full bg-white shadow-sm":"hidden"}/>
      {phase==="loading"?<p className="py-8 text-center text-sm text-slate-700">
        Preparando leitura local…
      </p>:null}
    </div>
  </div>;
}
