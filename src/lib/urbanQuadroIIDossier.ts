import {jsPDF} from "jspdf";
import type {UrbanQuadroIIWorkspace,UrbanReviewedMatrixImport} from "@/integrations/backend/urbanPrecheckClient";
const KEY=/^[a-f0-9]{64}$/i;
/** An audit-ready dossier, NOT a legal approval or a replacement for the original PDF. */
export function createQuadroIIDossier(
  workspace:UrbanQuadroIIWorkspace,municipalityId:string,
  legalImports:readonly UrbanReviewedMatrixImport[],historyReliable:boolean,
){
 if(!municipalityId||workspace.status!=="pending_legal_review"||
    !KEY.test(workspace.document_sha256||"")||
    !Array.isArray(workspace.entries)||workspace.entries.length>2000)
   throw new Error("Lote ou documento de origem não verificável.");
 const pdf=new jsPDF({unit:"mm",format:"a4",compress:false});
 const dark:[number,number,number]=[14,43,70];
 let y=43;
 function title(){
   pdf.setFillColor(...dark);pdf.rect(0,0,210,32,"F");
   pdf.setTextColor(255,255,255);pdf.setFont("helvetica","bold");pdf.setFontSize(13);
   pdf.text("SIGAPRO | QUADRO II",14,13);
   pdf.setFontSize(10);pdf.text("DOSSIÊ DE TRANSCRIÇÕES - CONFERÊNCIA MUNICIPAL",14,21);
   y=43;
 }
 function next(){pdf.addPage();title();}
 function text(value:string,size=8,bold=false,color:[number,number,number]=dark){
   pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(size);
   pdf.setTextColor(...color);
   const normalized=value.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").slice(0,2500);
   for(const row of pdf.splitTextToSize(normalized,181) as string[]){
     if(y>271)next();
     pdf.text(row||" ",14,y);y+=size>=10?5.5:4.3;
   }
 }
 title();
 text("RASCUNHO - NÃO É NORMA ATIVA, CERTIDÃO OU PARECER",10,true,[151,35,35]);
 y+=2;
 text("Prefeitura (identificação interna): "+municipalityId);
 text("Documento: "+String(workspace.document_title||"Não identificado"));
 text("SHA-256: "+workspace.document_sha256);
 text("Páginas de origem: "+workspace.pages.length+" | Transcrições preservadas: "+workspace.entries.length);
 text("Todos os índices abaixo exigem conferência do PDF e da vigência de alterações posteriores.");
 if(!historyReliable)text("ATENÇÃO: histórico de revisões jurídicas não pôde ser conferido.",8,true,[151,35,35]);
 y+=5;
 const imports=historyReliable?legalImports.filter(r=>r.municipality_id===municipalityId&&
   r.document_sha256===workspace.document_sha256&&r.quadro==="II"&&r.status==="reviewed_draft"):[];
 let previous=0;
 for(const entry of workspace.entries.slice().sort((a,b)=>a.page_number-b.page_number||
   a.category_code.localeCompare(b.category_code,"pt-BR"))){
   if(!Number.isInteger(entry.page_number))continue;
   if(entry.page_number!==previous){
     if(y>246)next();
     y+=4;
     text("PÁGINA "+entry.page_number+" | "+(workspace.pages.find(p=>p.page_number===entry.page_number)?.topic||"Sem tema"),10,true);
     const pg=workspace.pages.find(p=>p.page_number===entry.page_number);
     if(pg?.visual_warning)text("AVISO: PDF original exige inspeção visual.",8,true,[151,35,35]);
     previous=entry.page_number;
   }
   if(y>250)next();
   text(entry.category_code+" - "+entry.use_description,9,true);
   const reviews=imports.filter(r=>r.page_number===entry.page_number&&
     r.use_code.normalize("NFKC").toUpperCase()===entry.category_code.normalize("NFKC").toUpperCase());
   text("STATUS: RASCUNHO SEM HOMOLOGAÇÃO"+(historyReliable?
     (reviews.length?" | "+reviews.length+" revisão(ões) preliminar(es) por zona":" | sem revisão jurídica registrada"):
     " | histórico jurídico não verificado"),8,true,[151,35,35]);
   for(const [label,value] of [
     ["Zonas permitidas",entry.permitted_zones_text],["Vias",entry.road_hierarchy_text],
     ["Estacionamento",entry.parking_requirement_text],["Condições",entry.special_conditions_text],
     ["Trecho original candidato",entry.source_excerpt],
   ]){
     text(label+": "+(value?.trim()||"NÃO CONFERIDO"),8);
   }
   if(reviews.length)text("Revisões preliminares: "+reviews.map(r=>r.zone_code+
     " ("+r.effective_from+")").join("; "),8);
   y+=3;
   if(y<=272){pdf.setDrawColor(213,225,236);pdf.line(14,y,196,y);y+=5;}
 }
 const count=pdf.getNumberOfPages();
 for(let i=1;i<=count;i++){
   pdf.setPage(i);pdf.setDrawColor(210,222,235);pdf.line(14,282,196,282);
   pdf.setTextColor(84,102,118);pdf.setFontSize(7);pdf.setFont("helvetica","normal");
   pdf.text("SIGAPRO | RASCUNHO - SEM VALIDADE NORMATIVA",14,288);
   pdf.text("Página "+i+" / "+count,196,288,{align:"right"});
 }
 return pdf;
}
