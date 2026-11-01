/**
 * SIGAPRO QA — generic, local-only source-document reader.
 * The original PDF bytes never leave the browser. Get text runs and source
 * coordinates BEFORE asking image models to transcribe a blurred screenshot.
 * A PDF text layer is evidence, not legal validation or authorization to save.
 * PDF.js is used with isEvalSupported:false because PDFs are untrusted.
 */
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
export type PdfTextRun={
  text:string;x:number;y:number;width:number;height:number;
  page:number;
};
export type UrbanPdfSourceLayer={
  page:number;totalPages:number;runCount:number;textLength:number;
  textStatus:"text_available"|"low_quality_text"|"no_text_layer";
  runs:PdfTextRun[];
  zoneMatches:PdfTextRun[];usageMatches:PdfTextRun[];
  warnings:string[];
};
const upper=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleUpperCase("pt-BR").replace(/\s+/g," ").trim();
const squish=(s:string)=>upper(s).replace(/[^A-Z0-9]+/g,"");
const MAX_RUNS=3600;
const MAX_BYTES=100*1024*1024;
function matchesTerm(haystack:string,needle:string,key:"zona"|"uso"){
  const h=squish(haystack),n=squish(needle);
  if(!h||!n||n.length<2)return false;
  if(key==="zona")return h===n||h==="ZONA"+n;
  return h===n;
}
export async function readUrbanPdfSourcePage(
  file:File,pageNumber:number,zone:string,usage:string
):Promise<UrbanPdfSourceLayer>{
  if(!file||file.size<5||file.size>MAX_BYTES||!file.name.toLowerCase().endsWith(".pdf"))
    throw Error("Selecione o PDF original (máximo 100 MB).");
  if(!Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>10000)
    throw Error("Número da página PDF inválido.");
  const buf=await file.arrayBuffer();
  if(new TextDecoder().decode(buf.slice(0,5))!=="%PDF-")
    throw Error("O arquivo não possui assinatura PDF.");
  // Lazy import isolates the heavy PDF reader from normal SIGAPRO screens.
  const pdfjs=await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const task=pdfjs.getDocument({
    data:new Uint8Array(buf),isEvalSupported:false,stopAtErrors:true,
    useSystemFonts:true,
  });
  try{
    const pdf=await task.promise;
    if(pageNumber>pdf.numPages)throw Error("A página não existe no PDF (total: "+pdf.numPages+").");
    const page=await pdf.getPage(pageNumber);
    try{
      const viewport=page.getViewport({scale:1});
      const content=await page.getTextContent({includeMarkedContent:false});
      const items=content.items.filter((t):t is typeof content.items[number]&{
        str:string;transform:number[];width:number;height:number
      }=> typeof (t as {str?:unknown}).str==="string" &&
        Array.isArray((t as {transform?:unknown}).transform));
      const runs:PdfTextRun[]=items.slice(0,MAX_RUNS).flatMap(t=>{
        const text=t.str.trim();
        if(!text||text.length>800)return [];
        const [x,y]=viewport.convertToViewportPoint(t.transform[4],t.transform[5]);
        const height=Math.max(1,Math.abs(t.height||Math.hypot(t.transform[2],t.transform[3])));
        const width=Math.max(0,Math.abs(t.width||0));
        if(![x,y,height,width].every(Number.isFinite))return [];
        return [{text,x:Math.round(x*100)/100,
          y:Math.round((y-height)*100)/100,
          height:Math.round(height*100)/100,width:Math.round(width*100)/100,
          page:pageNumber}];
      });
      const textLength=runs.reduce((sum,r)=>sum+r.text.length,0);
      const garbage=runs.filter(r=>!/[A-Za-zÀ-ÿ0-9]/.test(r.text)).length;
      const quality=runs.length===0?"no_text_layer"
        :textLength<80||garbage>runs.length*.65?"low_quality_text":"text_available";
      const zoneMatches=runs.filter(r=>matchesTerm(r.text,zone,"zona")).slice(0,10);
      const usageMatches=runs.filter(r=>matchesTerm(r.text,usage,"uso")).slice(0,20);
      const warnings:string[]=[];
      if(quality==="no_text_layer")warnings.push("PDF sem camada de texto legível nesta página. Use uma digitalização melhor e OCR assistido.");
      if(quality==="low_quality_text")warnings.push("Camada de texto incompleta ou possivelmente corrompida. Não use números sem conferir a imagem.");
      if(quality==="text_available"&&(!zoneMatches.length||!usageMatches.length))
        warnings.push("Texto extraído, mas zona e uso não foram encontrados como rótulos completos. A linha exige inspeção.");
      if(items.length>MAX_RUNS)warnings.push("Página com muitos fragmentos; leitura limitada para proteger o navegador.");
      return {page:pageNumber,totalPages:pdf.numPages,runCount:runs.length,
        textLength,textStatus:quality,runs,zoneMatches,usageMatches,warnings};
    }finally{page.cleanup();}
  }finally{await task.destroy();}
}
export function sourceLayerExcerpt(layer:UrbanPdfSourceLayer,limit=600):string{
  const ordered=[...layer.runs].sort((a,b)=>a.y-b.y||a.x-b.x);
  return ordered.map(r=>r.text).join(" ").slice(0,Math.max(0,Math.min(limit,2000)));
}
