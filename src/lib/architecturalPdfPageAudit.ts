import type {DrawingExtraction} from "./architecturalPdfReadings.js";

/**
 * Independent, bounded page-number audit. Counts only when classic page
 * dictionaries AND the PDF page-tree count agree. Object-stream PDFs or
 * ambiguous trees return null instead of inventing a page count.
 * This does not render pages or establish visual inspection.
 */
export type ArchitecturalPdfPageAudit = {
  count:number|null;
  evidencePages:number[];
  pagesWithoutMeasurementEvidence:number[];
  countVerified:boolean;
  visualInspectionVerified:false;
  note:string;
};

function countClassicPdfPages(bytes:Uint8Array):number|null{
  if(bytes.length<100||bytes.length>8*1024*1024)return null;
  const raw=Buffer.from(bytes).toString("latin1");
  if(!raw.startsWith("%PDF-")||!raw.slice(-2048).includes("%%EOF"))return null;
  // Compressed object streams and encrypted dictionaries cannot be counted
  // safely by scanning uncompressed object headers.
  if(/\/Type\s*\/ObjStm\b|\/Encrypt\s+\d+\s+\d+\s+R\b/.test(raw))return null;
  let count=0;
  const treeCounts:number[]=[];
  for(const object of raw.matchAll(/\b\d{1,8}\s+\d{1,5}\s+obj\b([\s\S]*?)\bendobj\b/g)){
    const dictionary=object[1].split(/\bstream\r?\n/,1)[0];
    if(/\/Type\s*\/Page\b/.test(dictionary)){count++;continue;}
    if(/\/Type\s*\/Pages\b/.test(dictionary)){
      const marker=/\/Count\s+(\d{1,5})\b/.exec(dictionary);
      if(marker)treeCounts.push(Number(marker[1]));
    }
  }
  const total=Math.max(0,...treeCounts);
  return count>=1&&count<=100&&treeCounts.length>0&&total===count?count:null;
}
export function auditArchitecturalPdfPages(bytes:Uint8Array,extraction:DrawingExtraction):
  DrawingExtraction & {pageAudit:ArchitecturalPdfPageAudit}{
  const total=countClassicPdfPages(bytes);
  let badPage=false;
  const readings=extraction.readings.map(row=>{
    if(total!==null&&row.page!==null&&row.page>total){
      badPage=true;
      return {...row,value:null,page:null,usableForReview:false,
        reason:"Página citada fora das "+total+" páginas comprovadas no PDF. Revise a fonte."};
    }
    return row;
  });
  const evidencePages=[...new Set(readings.filter(r=>r.usableForReview&&r.value!==null&&r.page!==null)
    .map(r=>r.page as number))].sort((a,b)=>a-b);
  const pagesWithoutMeasurementEvidence=total===null?[]:
    Array.from({length:total},(_,i)=>i+1).filter(n=>!evidencePages.includes(n));
  const note=total===null
    ?"A contagem de páginas deste PDF não pôde ser comprovada pelo leitor estrutural. Nenhuma inspeção visual integral foi certificada."
    :"O PDF contém "+total+" página(s), com medidas documentadas em "+
      evidencePages.length+" página(s). Ausência de medida não significa ausência de desenho ou texto; todas as páginas ainda exigem conferência visual.";
  const warning=badPage
    ?"Foram recusadas cotas que citavam páginas além do total comprovado neste PDF."
    :null;
  return {
    ...extraction,readings,
    warnings:warning?[...extraction.warnings,warning]:extraction.warnings,
    pageAudit:{
      count:total,evidencePages,pagesWithoutMeasurementEvidence,
      countVerified:total!==null,visualInspectionVerified:false,
      note,
    },
  };
}
