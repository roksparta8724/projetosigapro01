import { useEffect, useRef, useState } from "react";
import { FileScan, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderUrbanGraphicPdfPage } from "@/lib/urbanGraphicPdfRenderer";
import { normalizeUrbanScanTranscript, validateUrbanScanTranscription } from "@/lib/urbanScannedTranscription";

type Props = {
  bytes: Uint8Array;
  scannedPages: number[];
  readOnly: boolean;
  onVerifiedTranscript: (entry: {page: number;text: string}) => void;
};

/**
 * Local visual transcription of a verified PDF. This is not an OCR model.
 * Uses PDF.js that the app already bundles; no upload, API call or persistence.
 */
export function UrbanScannedPageDesk({bytes,scannedPages,readOnly,onVerifiedTranscript}:Props){
  const pages=scannedPages.filter(page=>Number.isInteger(page)&&page>0&&page<=24);
  const [expanded,setExpanded]=useState(false);
  const [page,setPage]=useState(pages[0]||1);
  const [zoom,setZoom]=useState(1.35);
  const [first,setFirst]=useState("");
  const [second,setSecond]=useState("");
  const [checked,setChecked]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const canvas=useRef<HTMLCanvasElement|null>(null);
  useEffect(()=>{
    if(!expanded || !pages.includes(page))return;
    const abort=new AbortController();
    setBusy(true);setError("");
    if(!canvas.current) return;
    void renderUrbanGraphicPdfPage({
      bytes,pageNumber:page,scale:zoom,canvas:canvas.current,signal:abort.signal,
    }).then(()=>{
      if(!abort.signal.aborted)setBusy(false);
    }).catch(reason=>{
      if(!abort.signal.aborted){
        setBusy(false);
        setError(String((reason as Error)?.message||reason));
      }
    });
    return ()=>abort.abort();
  },[expanded,bytes,page,zoom]);
  if(readOnly||pages.length===0)return null;
  const issue=validateUrbanScanTranscription(first,second,page,pages);
  const reset=()=>{setFirst("");setSecond("");setChecked(false);setError("");};
  const confirm=()=>{
    if(issue||!checked||busy||error||!expanded)return;
    onVerifiedTranscript({page,text:normalizeUrbanScanTranscript(first)});
    reset();
  };
  return (
    <section data-urban-scanned-page="true" className="mt-4 min-w-0 rounded-[20px] border border-sky-200 bg-sky-50/80 p-4 text-slate-900 dark:border-sky-600 dark:bg-[#0d2942] dark:text-white">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 className="flex items-center gap-2 text-sm font-extrabold text-slate-950 dark:text-white">
            <FileScan className="h-5 w-5 text-sky-700 dark:text-sky-200"/>
            Conferência visual de página escaneada
          </h5>
          <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
            {pages.length} página(s) sem texto selecionável. Renderize a imagem localmente,
            transcreva duas vezes e confirme com o original. Não é OCR e não atesta conformidade.
          </p>
        </div>
        <Button type="button" variant="outline" aria-expanded={expanded}
          onClick={()=>{setExpanded(previous=>!previous);reset();}}>
          {expanded?"Fechar conferência":"Conferir página digitalizada"}
        </Button>
      </div>
      {expanded?(
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-800 dark:text-white">
              Página digitalizada
              <select aria-label="Página escaneada a conferir" className="mt-1 block h-10 min-w-36 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#0a1b30] dark:text-white"
                value={page} onChange={event=>{setPage(Number(event.target.value));reset();}}>
                {pages.map(number=><option key={number} value={number}>Página {number}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-800 dark:text-white">
              Ampliação
              <select aria-label="Zoom da página escaneada" className="mt-1 block h-10 min-w-36 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#0a1b30] dark:text-white"
                value={zoom} onChange={event=>setZoom(Number(event.target.value))}>
                <option value={1}>100%</option><option value={1.35}>135%</option>
                <option value={1.8}>180%</option><option value={2.3}>230%</option>
              </select>
            </label>
          </div>
          <div className="max-h-[550px] min-h-24 overflow-auto rounded-xl border border-slate-500 bg-[#27313d] p-2">
            <canvas ref={canvas} aria-label={"Visualização da página escaneada "+page}
              className="block max-w-none" />
          </div>
          {busy?<p role="status" className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
            <Loader2 className="h-4 w-4 animate-spin"/> Renderizando a página com PDF.js...
          </p>:null}
          {error?<p role="alert" className="rounded-lg border border-rose-400 bg-rose-950/60 p-2 text-xs text-rose-100">
            Não foi possível abrir esta página: {error}
          </p>:null}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-800 dark:text-white">
              Primeira leitura do trecho
              <textarea aria-label="Primeira leitura do trecho" maxLength={280} value={first}
                onChange={event=>{setFirst(event.target.value);setChecked(false);}}
                className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#081c30] dark:text-white"/>
            </label>
            <label className="text-xs font-bold text-slate-800 dark:text-white">
              Segunda leitura independente
              <textarea aria-label="Segunda leitura independente" maxLength={280} value={second}
                onChange={event=>{setSecond(event.target.value);setChecked(false);}}
                className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#081c30] dark:text-white"/>
            </label>
          </div>
          {first||second?<p role="status" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {issue||"As duas leituras coincidem. Ainda é necessária a confirmação na imagem."}
          </p>:null}
          <label className="flex items-start gap-2 text-xs font-semibold text-slate-800 dark:text-white">
            <input aria-label="Confirmei texto na imagem original" type="checkbox"
              disabled={Boolean(issue)||busy||Boolean(error)} checked={checked}
              onChange={event=>setChecked(event.target.checked)} className="mt-0.5"/>
            Examinei a imagem da página {page}, comparei as duas transcrições, confirmei os
            caracteres e assumo a conferência técnica deste trecho.
          </label>
          <Button type="button" disabled={Boolean(issue)||!checked||busy||Boolean(error)}
            onClick={confirm} className="rounded-xl bg-sky-700 text-white hover:bg-sky-800">
            <ShieldCheck className="mr-2 h-4 w-4"/> Usar trecho conferido da página {page}
          </Button>
        </div>
      ):null}
    </section>
  );
}
