import type { ProcessDocument } from "@/lib/platform";

/**
 * Consultation-only intake report for an already authorized process.
 * No fetches, OCR, financial writes, AI model or automatic regulatory conclusion.
 * Regulation, municipality and legal catalog are sourced by the caller's scoped panel.
 */
export type UrbanDossierIssue = {
  code: "NO_REQUIRED_CHECKLIST" | "REQUIRED_MISSING" | "FILE_UNAVAILABLE" |
    "REJECTED_DOCUMENT" | "MANUAL_REVIEW" | "UNSUPPORTED_NATIVE_FORMAT" |
    "NO_APPLICABLE_REGULATION" | "LEGAL_CATALOG_LOADING" |
    "LEGAL_CATALOG_FAILED" | "NO_VERIFIED_LEGAL_EXCERPTS";
  severity: "attention" | "information";
  message: string;
  documentId?: string;
};
export type UrbanDossierReport = {
  requiredTotal: number;
  requiredAvailable: number;
  pdfWithOriginal: number;
  externalFormatCount: number;
  pendingHumanReview: number;
  legalEvidenceCount: number;
  completeForHumanReview: boolean;
  issues: UrbanDossierIssue[];
};

const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/\s+/g," ");
const pdfLike=(doc:ProcessDocument)=>doc.mimeType?.toLowerCase().split(";")[0]?.trim()==="application/pdf" ||
  /\.pdf$/i.test(doc.fileName?.trim()||"");
const nativePlans=(doc:ProcessDocument)=>/\.(?:dwg|dxf|ifc|rvt)$/i.test(doc.fileName?.trim()||"");
const readableOriginal=(doc:ProcessDocument)=>doc.uploaded && Boolean(doc.filePath?.trim());
function latestDocuments(documents: readonly ProcessDocument[]) {
  // Historical versions may coexist. Only the latest version of a requirement
  // determines whether that requirement is currently satisfied.
  const current=new Map<string,ProcessDocument>();
  for(const doc of documents) {
    const key=normalize(doc.label)||doc.id;
    const existing=current.get(key);
    if(!existing || (Number(doc.version)||0)>=(Number(existing.version)||0))
      current.set(key,doc);
  }
  return [...current.values()];
}

export function inspectUrbanDossier(input:{
  documents:readonly ProcessDocument[];
  hasApplicableRegulation:boolean;
  legalCatalogState:"loading"|"failed"|"ready";
  legalEvidenceCount:number;
}):UrbanDossierReport {
  const docs=latestDocuments(input.documents);
  const required=docs.filter(d=>d.required);
  const issues:UrbanDossierIssue[]=[];
  const add=(code:UrbanDossierIssue["code"],severity:UrbanDossierIssue["severity"],
    message:string,documentId?:string)=>issues.push({code,severity,message,documentId});
  if(required.length===0) add("NO_REQUIRED_CHECKLIST","attention",
    "Nenhuma exigência documental obrigatória foi identificada no processo. Confira o checklist municipal vigente.");
  for(const d of required) {
    const label=d.label||"Documento obrigatório";
    if(!d.uploaded) add("REQUIRED_MISSING","attention",label+": documento obrigatório não anexado.",d.id);
    else if(!d.filePath?.trim()) add("FILE_UNAVAILABLE","attention",
      label+": o registro existe, mas o arquivo original não está disponível para leitura autenticada.",d.id);
    if(d.reviewStatus==="rejeitado") add("REJECTED_DOCUMENT","attention",
      label+": documento rejeitado; confira a versão correta.",d.id);
    else if(d.uploaded && d.reviewStatus!=="aprovado") add("MANUAL_REVIEW","information",
      label+": conferência documental humana ainda necessária.",d.id);
  }
  const external=docs.filter(d=>readableOriginal(d)&&nativePlans(d)&&!pdfLike(d));
  if(external.length) add("UNSUPPORTED_NATIVE_FORMAT","information",
    external.length+" arquivo(s) CAD/BIM (DWG, DXF, IFC ou RVT) exigem verificador próprio ou conversão autorizada. Não foram analisados automaticamente.");
  if(!input.hasApplicableRegulation)
    add("NO_APPLICABLE_REGULATION","attention",
      "Não há norma ativa selecionada para a prefeitura, zona, uso e data informados.");
  if(input.legalCatalogState==="loading")
    add("LEGAL_CATALOG_LOADING","attention","Acervo legal municipal ainda não carregado.");
  else if(input.legalCatalogState==="failed")
    add("LEGAL_CATALOG_FAILED","attention","Não foi possível verificar o acervo legal desta prefeitura.");
  else if(input.legalEvidenceCount===0)
    add("NO_VERIFIED_LEGAL_EXCERPTS","attention",
      "Não há trechos de legislação confirmados no acervo consultado. A norma cadastrada não substitui a citação verificável da lei.");
  const requiredAvailable=required.filter(d=>readableOriginal(d)&&d.reviewStatus!=="rejeitado").length;
  return {
    requiredTotal:required.length,
    requiredAvailable,
    pdfWithOriginal:docs.filter(d=>readableOriginal(d)&&pdfLike(d)).length,
    externalFormatCount:external.length,
    pendingHumanReview:required.filter(d=>d.uploaded&&d.reviewStatus!=="aprovado").length,
    legalEvidenceCount:Math.max(0,Math.floor(input.legalEvidenceCount)||0),
    completeForHumanReview:required.length>0 && requiredAvailable===required.length &&
      input.hasApplicableRegulation && input.legalCatalogState==="ready" &&
      input.legalEvidenceCount>0 && external.length===0 &&
      !issues.some(i=>i.code==="REJECTED_DOCUMENT"),
    issues,
  };
}
