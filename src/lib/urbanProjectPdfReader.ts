/** Local architectural-project PDF text analysis. No network, no OCR guesses. */
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {extractProjectMeasures,type ProjectMeasurementReview,type ProjectTextLine} from "./urbanArchitecturalMeasures";
export type ProjectPdfInspection=ProjectMeasurementReview&{
 fileName:string;sha256:string;totalPages:number;pagesRead:number;
 pagesWithoutText:number[];truncated:boolean;warnings:string[];
};
export async function inspectArchitecturalProjectPdf(file:File):Promise<ProjectPdfInspection>{
 if(!file||!file.name.toLowerCase().endsWith(".pdf")||file.size<5||file.size>80*1024*1024)
  throw Error("Selecione PDF de projeto válido, de até 80 MB.");
 const bytes=await file.arrayBuffer();
 if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw Error("Arquivo sem assinatura PDF.");
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 const sha256=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
 const pdfjs=await import("pdfjs-dist");
 pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
 const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,stopAtErrors:true,useSystemFonts:true});
 try{
  const pdf=await task.promise;
  if(pdf.numPages>10000||pdf.numPages<1)throw Error("Quantidade de páginas do projeto inválida.");
  const pageLimit=Math.min(pdf.numPages,60);
  const pagesWithoutText:number[]=[];
  const warnings:string[]=[];
  const lines:ProjectTextLine[]=[];
  for(let pageNum=1;pageNum<=pageLimit;pageNum++){
   const page=await pdf.getPage(pageNum);
   try{
    const content=await page.getTextContent({includeMarkedContent:false});
    const viewport=page.getViewport({scale:1});
    const fragments=content.items.slice(0,5000).flatMap(item=>{
     const itemText=item as {str?:unknown;transform?:number[];width?:number;height?:number};
     if(typeof itemText.str!=="string"||!Array.isArray(itemText.transform))return [];
     const str=itemText.str.trim();if(!str||str.length>350)return [];
     const [x,y]=viewport.convertToViewportPoint(itemText.transform[4],itemText.transform[5]);
     if(!Number.isFinite(x)||!Number.isFinite(y))return [];
     return [{x,y,text:str}];
    });
    if(content.items.length>5000)warnings.push(`Página ${pageNum}: mais de 5 mil fragmentos; verificar manualmente.`);
    if(fragments.reduce((sum,f)=>sum+f.text.length,0)<25){
     pagesWithoutText.push(pageNum);continue;
    }
    // Prefer same visual baseline, then horizontal coordinate. Avoid pairing
    // unrelated standalone numbers elsewhere in the page.
    fragments.sort((a,b)=>a.y-b.y||a.x-b.x);
    const rows:Array<{y:number;parts:typeof fragments}>=[];
    for(const fragment of fragments){
      const last=rows[rows.length-1];
      if(last&&Math.abs(last.y-fragment.y)<=3.4)last.parts.push(fragment);
      else rows.push({y:fragment.y,parts:[fragment]});
    }
    for(const row of rows){
      const str=row.parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(" ").replace(/\s+/g," ").trim();
      if(str.length>=5&&str.length<=550)lines.push({page:pageNum,text:str});
    }
   }finally{page.cleanup();}
  }
  const review=extractProjectMeasures(lines);
  if(pdf.numPages>pageLimit)warnings.push(`Leitura parcial: ${pageLimit} de ${pdf.numPages} páginas. Não concluir sem examinar as restantes.`);
  if(pagesWithoutText.length)warnings.push(`${pagesWithoutText.length} página(s) sem camada de texto suficiente. Exigem exame da imagem e OCR/verificação separados.`);
  if(!review.proposals.length)warnings.push("Nenhuma medição declarada inequivocamente no texto. Avalie as pranchas; não inferir cotas por proximidade.");
  return {...review,fileName:file.name,sha256,totalPages:pdf.numPages,
   pagesRead:pageLimit,pagesWithoutText,truncated:pdf.numPages>pageLimit,warnings};
 }finally{await task.destroy();}
}
