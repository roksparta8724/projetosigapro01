import {describe,expect,it} from "vitest";
import {
 defaultMunicipalWorkflowStages,defaultMunicipalWorkflowTransitions,type MunicipalStageCode,
} from "@/lib/govtech";
import {
 buildMunicipalWorkflowForKind,resolveAllowedTransitions,getWorkflowProgress,
} from "@/lib/workflowEngine";
import {normalizeFinancialGuideStatus,isBankVerifiedFinancialGuide} from "@/lib/qaPaymentEvidence";
import {getQa04GeometryChecks,createQa04ArchitecturalPdfBytes} from "@/lib/qa04ArchitecturalFixture";
import {extractNativeArchitecturalPdf} from "../../server/native-architectural-pdf";
import {auditArchitecturalPdfPages} from "@/lib/architecturalPdfPageAudit";
import {selectUrbanRegulation,evaluateUrbanPrecheck} from "@/lib/urbanPrecheck";

/** Real core functions, intentionally NO browser/Neon login or bank mutation. */
function act(from:MunicipalStageCode,to:MunicipalStageCode,role:string,rules:string[]){
 const paths=resolveAllowedTransitions({currentStageCode:from,role,completedRules:rules});
 expect(paths.map(x=>x.toStageCode)).toContain(to);
 return paths.find(x=>x.toStageCode===to)!;
}
describe("SIGAPRO — ensaio integrado de fluxo sem quebrar numeração e responsabilidades",()=>{
 it("todas as etapas possuem uma transição consistente, sem editar processo como admin",()=>{
  const codes=new Set(defaultMunicipalWorkflowStages.map(x=>x.code));
  expect(codes.size).toBe(defaultMunicipalWorkflowStages.length);
  expect(defaultMunicipalWorkflowStages.filter(x=>x.terminal).map(x=>x.code)).toEqual(["completed"]);
  for(const x of defaultMunicipalWorkflowTransitions){
   expect(codes.has(x.fromStageCode)).toBe(true);
   expect(codes.has(x.toStageCode)).toBe(true);
   expect(x.allowedRoles).not.toContain("prefeitura_admin");
   expect(x.validationRules.length).toBeGreaterThan(0);
  }
  for(const x of defaultMunicipalWorkflowStages.filter(x=>!x.terminal))
    expect(defaultMunicipalWorkflowTransitions.some(y=>y.fromStageCode===x.code)).toBe(true);
  for(const stage of codes)expect(resolveAllowedTransitions({
   currentStageCode:stage,role:"prefeitura_admin",
   completedRules:Array.from(new Set(defaultMunicipalWorkflowTransitions.flatMap(x=>x.validationRules))),
  })).toHaveLength(0);
 });
 it("aprovação: só gera protocolo oficial após guia, depois triagem, reanálise, decisão e alvará",()=>{
  const flow=buildMunicipalWorkflowForKind("aprovacao");
  expect(flow.stages.map(s=>s.code)).toEqual([
   "protocol_initial","initial_fee","initial_settlement","document_screening",
   "technical_analysis","formal_requirement","resubmission","approval","complementary_fee","completed",
  ]);
  const steps:[
    MunicipalStageCode,MunicipalStageCode,string,string[]
  ][]=[
   ["protocol_initial","initial_fee","profissional_externo",["protocol_data_completed","required_documents_present"]],
   ["initial_fee","initial_settlement","atendimento_balcao",["guide_issued","original_pdf_archived"]],
   ["initial_settlement","document_screening","financeiro",["guide_compensated","protocol_officialized"]],
   ["document_screening","technical_analysis","atendimento_balcao",["approval_protocol","triage_completed","required_documents_present"]],
   ["technical_analysis","formal_requirement","analista",["checklist_started"]],
   ["formal_requirement","resubmission","profissional_externo",["requirement_answered"]],
   ["resubmission","technical_analysis","atendimento_balcao",["replacement_documents_valid"]],
   ["technical_analysis","approval","analista",["approval_protocol","checklist_completed","no_open_requirements","legal_review_verified"]],
   ["approval","complementary_fee","financeiro",["approval_granted"]],
   ["complementary_fee","completed","diretor",["final_guide_compensated","construction_permit_signed"]],
  ];
  for(const [from,to,role,rules] of steps){
   expect(flow.transitions).toContainEqual(expect.objectContaining({fromStageCode:from,toStageCode:to}));
   act(from,to,role,rules);
  }
  expect(getWorkflowProgress("completed",flow.stages).progressPercent).toBe(100);
  expect(flow.stages.find(s=>s.code==="occupancy_permit")).toBeUndefined();
 });
 it("habite-se tem novo protocolo, sua própria guia, vistoria e assinatura",()=>{
  const flow=buildMunicipalWorkflowForKind("habite_se");
  expect(flow.stages.map(x=>x.code)).toEqual([
   "protocol_initial","initial_fee","initial_settlement","document_screening","technical_analysis",
   "formal_requirement","resubmission","habite_se_inspection","habite_se_fee","occupancy_permit","completed",
  ]);
  act("protocol_initial","initial_fee","profissional_externo",["protocol_data_completed","required_documents_present"]);
  act("initial_fee","initial_settlement","financeiro",["guide_issued","original_pdf_archived"]);
  act("initial_settlement","document_screening","financeiro",["guide_compensated","protocol_officialized"]);
  act("document_screening","technical_analysis","prefeitura_supervisor",
   ["habite_se_protocol","triage_completed","required_documents_present"]);
  act("technical_analysis","habite_se_inspection","analista",
   ["habite_se_protocol","checklist_completed","no_open_requirements"]);
  act("habite_se_inspection","habite_se_fee","analista",["inspection_completed"]);
  act("habite_se_fee","occupancy_permit","financeiro",
   ["habite_se_guide_issued","habite_se_guide_shared","habite_se_guide_compensated"]);
  act("occupancy_permit","completed","diretor",
   ["inspection_completed","habite_se_guide_compensated","occupancy_permit_signed"]);
  expect(flow.transitions.find(x=>x.fromStageCode==="complementary_fee")).toBeUndefined();
 });
 it("bloqueia pular guia, triagem e assinatura mesmo com a função adequada",()=>{
  expect(resolveAllowedTransitions({currentStageCode:"protocol_initial",role:"profissional_externo",
   completedRules:[]})).toHaveLength(0);
  expect(resolveAllowedTransitions({currentStageCode:"initial_fee",role:"financeiro",
   completedRules:["guide_issued"]})).toHaveLength(0);
  expect(resolveAllowedTransitions({currentStageCode:"initial_settlement",role:"financeiro",
   completedRules:["protocol_officialized"]})).toHaveLength(0);
  expect(resolveAllowedTransitions({currentStageCode:"document_screening",role:"atendimento_balcao",
   completedRules:["approval_protocol","required_documents_present"]})).toHaveLength(0);
  expect(resolveAllowedTransitions({currentStageCode:"technical_analysis",role:"analista",
   completedRules:["checklist_completed","no_open_requirements"]}).map(x=>x.toStageCode))
   .not.toContain("approval");
  expect(resolveAllowedTransitions({currentStageCode:"complementary_fee",role:"financeiro",
   completedRules:["final_guide_compensated"]})).toHaveLength(0);
  expect(resolveAllowedTransitions({currentStageCode:"habite_se_inspection",role:"analista",
   completedRules:[]})).toHaveLength(0);
  expect(resolveAllowedTransitions({currentStageCode:"habite_se_fee",role:"financeiro",
   completedRules:["habite_se_guide_issued"]})).toHaveLength(0);
  expect(resolveAllowedTransitions({currentStageCode:"occupancy_permit",role:"diretor",
   completedRules:["inspection_completed","habite_se_guide_compensated"]})).toHaveLength(0);
 });
 it("PDF de ensaio realmente parseado, lei fictícia negada e compensação não significa dinheiro",()=>{
  const bytes=new Uint8Array(createQa04ArchitecturalPdfBytes());
  const report=auditArchitecturalPdfPages(bytes,extractNativeArchitecturalPdf(bytes));
  expect(report.pageAudit.countVerified).toBe(true);
  expect(report.pageAudit.count).toBe(3);
  const byMetric=(key:string)=>report.readings.find(x=>x.metric===key);
  expect(byMetric("front_setback_m")?.value).toBe(5);
  expect(byMetric("side_setback_m")?.value).toBe(1);
  expect(byMetric("rear_setback_m")?.value).toBe(12);
  expect(getQa04GeometryChecks().widthFits).toBe(true);
  expect(getQa04GeometryChecks().depthFits).toBe(true);
  expect(selectUrbanRegulation([],"city","Z1","RES","2026-11-09")).toBeNull();
  expect(evaluateUrbanPrecheck([{metric:"front_setback_m",limit:5,reference:"Lei demonstrativa sem vigência"}],
   {front_setback_m:{value:5,evidence:""}})[0].status).toBe("missing_evidence");
  expect(normalizeFinancialGuideStatus("compensada")).toBe("compensada");
  expect(isBankVerifiedFinancialGuide({status:"compensada"})).toBe(false);
  expect(isBankVerifiedFinancialGuide({status:"compensada",providerEnvironment:"test",
   bankStatus:"processed",bankStatusDetail:"accredited"})).toBe(false);
 });
});
