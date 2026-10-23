import { useEffect, useRef, useState } from "react";
import { FileScan, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderUrbanGraphicPdfPage } from "@/lib/urbanGraphicPdfRenderer";
import { normalizeUrbanScanTranscript, validateUrbanScanTranscription } from "@/lib/urbanScannedTranscription";
import { browserOcrIsOffered, suggestUrbanBrowserOcr } from "@/lib/urbanBrowserOcr";

type Props = {
  bytes: Uint8Array;
  scannedPages: number[];
  readOnly: boolean;
  onVerifiedTranscript: (entry: {page: number;text: string; method:"visual_double_transcription"|"browser_ocr_human_verified"}) => void;
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
  const [ocrText,setOcrText]=useState("");
  const [ocrError,setOcrError]=useState("");
  const [ocrBusy,setOcrBusy]=useState(false);
  const [ocrAssisted,setOcrAssisted]=useState(false);
  const ocrEpoch=useRef(0);
  const canvas=useRef<HTMLCanvasElement|null>(null);
  // A newly loaded PDF must never inherit unverified text or an OCR result
  // from the previous document, even when the viewer keeps the same page.
  useEffect(()=>{
    ++ocrEpoch.current;
    setExpanded(false);
    setPage(pages[0]||1);
    setFirst("");
    setSecond("");
    setChecked(false);
    setBusy(false);
    setError("");
    setOcrText("");
    setOcrError("");
    setOcrBusy(false);
    setOcrAssisted(false);
  },[bytes]);
  useEffect(()=>{
    if(!expanded || !pages.includes(page))return;
    const abort=new AbortController();
    ++ocrEpoch.current;
    setOcrText("");setOcrError("");setOcrBusy(false);setOcrAssisted(false);
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
    return ()=>{abort.abort();++ocrEpoch.current;};
  },[expanded,bytes,page,zoom]);
  if(readOnly||pages.length===0)return null;
  const issue=validateUrbanScanTranscription(first,second,page,pages);
  const reset=()=>{setFirst("");setSecond("");setChecked(false);setError("");setOcrText("");setOcrError("");setOcrAssisted(false);++ocrEpoch.current;setOcrBusy(false);};
  const suggestOcr=async()=>{
    if(!expanded||busy||ocrBusy||error||!canvas.current||!browserOcrIsOffered())return;
    const attempt=++ocrEpoch.current;
    setOcrBusy(true);setOcrError("");setOcrText("");
    try{
      const result=await suggestUrbanBrowserOcr(canvas.current);
      if(attempt!==ocrEpoch.current)return;
      if(!result.trim()){
        setOcrError("Nenhuma palavra reconhecida na imagem. Continue com a transcrição visual.");
      }else{
        setOcrText(result);
      }
    }catch(problem){
      if(attempt===ocrEpoch.current)setOcrError(String((problem as Error)?.message||problem));
    }finally{
      if(attempt===ocrEpoch.current)setOcrBusy(false);
    }
  };
  const confirm=()=>{
    if(issue||!checked||busy||error||!expanded)return;
    onVerifiedTranscript({page,text:normalizeUrbanScanTranscript(first),
      method:ocrAssisted?"browser_ocr_human_verified":"visual_double_transcription"});
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
                value={zoom} onChange={event=>{reset();setZoom(Number(event.target.value));}}>
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
          <div data-urban-browser-ocr="true" className="rounded-xl border border-sky-200 bg-white p-3 text-xs text-slate-800 dark:border-sky-700 dark:bg-[#10273d] dark:text-slate-100">
            <p className="font-extrabold">Sugestão OCR nativa do navegador — experimental</p>
            <p className="mt-1 leading-5">
              Esta opção só funciona se o navegador disponibilizar reconhecimento local em português.
              O texto pode conter erros ou omissões. Não envia a página a um serviço externo
              nem substitui a dupla conferência humana.
            </p>
            {browserOcrIsOffered()?(
              <Button type="button" size="sm" variant="outline" className="mt-2"
                disabled={busy||ocrBusy||Boolean(error)}
                onClick={()=>void suggestOcr()}>
                {ocrBusy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}
                {ocrBusy?"Analisando no navegador...":"Sugerir texto por OCR local"}
              </Button>
            ):(
              <p role="status" className="mt-2 font-semibold text-amber-800 dark:text-amber-200">
                OCR nativo não disponível neste navegador; utilize a transcrição dupla abaixo.
              </p>
            )}
            {ocrError?<p role="alert" className="mt-2 text-amber-800 dark:text-amber-200">{ocrError}</p>:null}
            {ocrText?(
              <div className="mt-2 space-y-2">
                <label className="block font-bold">
                  Resultado bruto estimado, não confirmado
                  <textarea aria-label="Sugestão bruta de OCR" readOnly value={ocrText}
                    className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#081e32] dark:text-white"/>
                </label>
                <Button type="button" size="sm" variant="outline" onClick={()=>{
                  setFirst(ocrText.slice(0,280));setSecond("");setChecked(false);setOcrAssisted(true);
                }}>
                  Copiar sugestão somente para a primeira leitura
                </Button>
                <p className="leading-5">A segunda leitura deve ser feita independentemente a partir da imagem, sem copiar a sugestão.</p>
              </div>
            ):null}
          </div>
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
            caracteres e assumo a conferência técnica deste trecho. Se utilizei OCR,
            confirmo que revisei também todos os caracteres sugeridos.
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
