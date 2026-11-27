import type {jsPDF} from "jspdf";

export type PermitContinuation = {title:string;body:string};
const NOTICE="Texto integral nas páginas de continuação.";
/** A fixed-height summary never silently discards a legal condition. */
export function permitSummaryLines(lines:string[],maxLines:number){
 if(!Number.isInteger(maxLines)||maxLines<2)throw Error("Limite de linhas inválido.");
 return lines.length<=maxLines?{lines,overflow:false}:{lines:[...lines.slice(0,maxLines-1),NOTICE],overflow:true};
}

/** Append full text, not an abbreviated extract. All pages share the same
 * permit number/protocol. No changes to the principal page or signature flags.
 * This is document layout only, not digital signature or archival proof. */
export function appendPermitContinuations(pdf:jsPDF,context:{
 municipality:string;permitNumber:string;protocol:string;documentTitle:string;sections:PermitContinuation[];
}){
 if(!context.sections.length)return;
 const margin=16;
 let y=0;
 const startPage=()=>{
  pdf.addPage("a4","portrait");
  const w=pdf.internal.pageSize.getWidth();
  const h=pdf.internal.pageSize.getHeight();
  pdf.setFillColor(8,47,73);pdf.rect(0,0,w,12,"F");
  pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(10);
  pdf.text("SIGAPRO MUNICIPAL | CONTINUAÇÃO",margin,8);
  pdf.setTextColor(15,23,42);pdf.setFontSize(11);
  let cursor=21;
  for(const line of [context.municipality,context.documentTitle,"Alvará: "+context.permitNumber,"Processo: "+context.protocol]){
   const wrapped=pdf.splitTextToSize(line,w-2*margin) as string[];
   if(wrapped.length>8)throw Error("Identificação extensa demais para a página de continuação.");
   pdf.text(wrapped,margin,cursor,{lineHeightFactor:1.3});
   cursor+=wrapped.length*5;
  }
  pdf.setDrawColor(203,213,225);pdf.line(margin,cursor,w-margin,cursor);
  pdf.line(margin,h-12,w-margin,h-12);
  pdf.setFont("helvetica","normal");pdf.setFontSize(8);pdf.setTextColor(71,85,105);
  pdf.text("Parte integrante do documento • Página "+pdf.getNumberOfPages(),margin,h-7);
  y=cursor+9;
 };
 const pageBottom=()=>pdf.internal.pageSize.getHeight()-20;
 const title=(value:string)=>{
  pdf.setTextColor(8,47,73);pdf.setFont("helvetica","bold");pdf.setFontSize(11);
  pdf.text(value,margin,y);y+=8;
 };
 startPage();
 for(const section of context.sections){
  if(!section.body.trim())continue;
  if(y+18>pageBottom())startPage();
  title(section.title);
  pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.setTextColor(15,23,42);
  const lines=pdf.splitTextToSize(section.body,pdf.internal.pageSize.getWidth()-2*margin) as string[];
  // Refuse excessive documents explicitly instead of creating a partial PDF.
  if(lines.length>20000)throw Error("Texto excede o limite de geração integral do documento.");
  for(const line of lines){
   if(y>pageBottom()){
    startPage();title(section.title+" (continuação)");
    pdf.setFont("helvetica","normal");pdf.setFontSize(10);pdf.setTextColor(15,23,42);
   }
   pdf.text(line,margin,y);y+=5;
  }
  y+=7;
 }
}
