import {describe,expect,it} from "vitest";
import {inspectUrbanDossier} from "@/lib/urbanDossierReadiness";
import type {ProcessDocument} from "@/lib/platform";
const doc=(label:string,attrs:Partial<ProcessDocument>={}):ProcessDocument=>({
  id:label.replace(/\W/g,"-"),label,required:true,uploaded:true,signed:false,version:1,
  source:"profissional",fileName:label+".pdf",filePath:"municipalities/qa/process/file.pdf",
  mimeType:"application/pdf",reviewStatus:"aprovado",...attrs,
});
const setup=(docs:ProcessDocument[],legalCount=2)=>inspectUrbanDossier({
  documents:docs,hasApplicableRegulation:true,legalCatalogState:"ready",legalEvidenceCount:legalCount
});
describe("SIGAPRO IA — preflight de leitura e evidência, sem aprovação automática",()=>{
 it("informa documento obrigatório ausente sem presumir que foi enviado",()=>{
   const report=setup([doc("Projeto arquitetônico",{uploaded:false,filePath:undefined})]);
   expect(report.requiredAvailable).toBe(0);
   expect(report.issues.some(i=>i.code==="REQUIRED_MISSING")).toBe(true);
   expect(report.completeForHumanReview).toBe(false);
 });
 it("nega acesso por metadados apenas quando arquivo original não está disponível",()=>{
   const report=setup([doc("Memorial",{filePath:"",previewUrl:"https://x.test/signed"})]);
   expect(report.issues.some(i=>i.code==="FILE_UNAVAILABLE")).toBe(true);
   expect(report.completeForHumanReview).toBe(false);
 });
 it("não considera um documento rejeitado como suficiente",()=>{
   const report=setup([doc("ART",{reviewStatus:"rejeitado"})]);
   expect(report.issues.some(i=>i.code==="REJECTED_DOCUMENT")).toBe(true);
   expect(report.completeForHumanReview).toBe(false);
 });
 it("seleciona a versão mais nova em vez de contar a anterior",()=>{
   const report=setup([doc("Projeto",{id:"antigo",version:1,reviewStatus:"rejeitado"}),
     doc("Projeto",{id:"novo",version:2,reviewStatus:"aprovado"})]);
   expect(report.requiredTotal).toBe(1);
   expect(report.requiredAvailable).toBe(1);
   expect(report.issues.some(i=>i.code==="REJECTED_DOCUMENT")).toBe(false);
 });
 it("reconhece CAD e BIM como formatos ainda não interpretados automaticamente",()=>{
   const report=setup([doc("Planta IFC",{fileName:"modelo.ifc",mimeType:"application/octet-stream"})]);
   expect(report.externalFormatCount).toBe(1);
   expect(report.pdfWithOriginal).toBe(0);
   expect(report.issues.some(i=>i.code==="UNSUPPORTED_NATIVE_FORMAT")).toBe(true);
   expect(report.completeForHumanReview).toBe(false);
 });
 it("não interpreta OCR do scan apenas pelo nome do PDF",()=>{
   const report=setup([doc("Prancha escaneada",{fileName:"scan.pdf"})]);
   expect(report.pdfWithOriginal).toBe(1);
   expect(report.completeForHumanReview).toBe(true);
   // TRUE is only basic inventory completeness — never scan or legal conformance.
 });
 it("não diz pronto sem legislação vigente ou sem citação humana no acervo",()=>{
   const noNorm=inspectUrbanDossier({documents:[doc("Projeto")],hasApplicableRegulation:false,legalCatalogState:"ready",legalEvidenceCount:2});
   expect(noNorm.completeForHumanReview).toBe(false);
   expect(noNorm.issues.some(i=>i.code==="NO_APPLICABLE_REGULATION")).toBe(true);
   const noCitation=setup([doc("Projeto")],0);
   expect(noCitation.issues.some(i=>i.code==="NO_VERIFIED_LEGAL_EXCERPTS")).toBe(true);
   expect(noCitation.completeForHumanReview).toBe(false);
 });
 it("distingue carregamento e falha do acervo, sem mascarar indisponibilidade",()=>{
   for(const state of ["failed","loading"] as const){
     const r=inspectUrbanDossier({documents:[doc("Projeto")],hasApplicableRegulation:true,
       legalCatalogState:state,legalEvidenceCount:1});
     expect(r.completeForHumanReview).toBe(false);
   }
 });
 it("mantém revisão humana pendente visível sem alterar checklists oficiais",()=>{
   const report=setup([doc("Memorial",{reviewStatus:"pendente"})]);
   expect(report.pendingHumanReview).toBe(1);
   expect(report.issues.some(i=>i.code==="MANUAL_REVIEW")).toBe(true);
 });
 it("sem checklist configurado, bloqueia declaração de completude",()=>{
   const report=setup([]);
   expect(report.issues.some(i=>i.code==="NO_REQUIRED_CHECKLIST")).toBe(true);
   expect(report.completeForHumanReview).toBe(false);
 });
});