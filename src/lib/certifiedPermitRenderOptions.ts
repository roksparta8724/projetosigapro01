import type {jsPDF} from "jspdf";
export type CertifiedDraftRenderOptions = {
 /** Immutable persisted creation instant, not the server clock. */
 createdAt:string;
 /** Stable document identifier derived from the trusted snapshot hash. */
 fileId:string;
 /** Previously verified PNG/JPEG bytes, never a remote URL. */
 logoDataUrl?:string|null;
};
export function applyPermitRenderMetadata(pdf:jsPDF,options:CertifiedDraftRenderOptions){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(options.createdAt)||!Number.isFinite(Date.parse(options.createdAt))||!/^[a-f0-9]{32}$/i.test(options.fileId))throw Error("Identificação da minuta certificada inválida.");
 if(options.logoDataUrl&&(options.logoDataUrl.length>2_800_000||!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(options.logoDataUrl)))throw Error("Brasão da minuta certificada inválido.");
 const timestamp=new Date(options.createdAt).toISOString().slice(0,19).replace(/[-T:]/g,"");
 // PDF dates use an explicit UTC offset, not the local timezone.
 pdf.setCreationDate("D:"+timestamp+"+00'00'");
 pdf.setFileId(options.fileId.toUpperCase());
}
export function markUnsignedCertificateDraft(pdf:jsPDF){
 for(let page=1;page<=pdf.getNumberOfPages();page++){
  pdf.setPage(page);
  const width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
  pdf.setFillColor(254,243,199);pdf.rect(0,0,width,5,"F");
  pdf.setTextColor(120,53,15);pdf.setFont("helvetica","bold");pdf.setFontSize(7);
  pdf.text("MINUTA PARA ASSINATURA CERTIFICADA - SEM VALIDADE DE ALVARA",width/2,3.5,{align:"center"});
  pdf.setFillColor(254,243,199);pdf.rect(0,height-5,width,5,"F");
  pdf.text("SIGAPRO | DOCUMENTO NAO EMITIDO",width/2,height-1.7,{align:"center"});
 }
}
