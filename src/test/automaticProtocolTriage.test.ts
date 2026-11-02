import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
describe("SIGAPRO automated postpayment triage",()=>{
 const sql=read("neon/migrations/20261102_automatic_protocol_triage_v1.sql");
 it("keeps payment and numbering as prerequisites, never reissues a guide",()=>{
   expect(sql).toContain("_p.officialized_at IS NULL");
   expect(sql).toContain("g.guide_kind='protocolo'");
   expect(sql).not.toContain("next_tenant_protocol_number");
   expect(sql).not.toContain("UPDATE public.payment_guides");
 });
 it("gates forwarding on original documents and cadastro; never technical approval",()=>{
   for(const label of ["Projeto Arquitetônico","Memorial Descritivo","ART/RRT","Escritura/Matrícula"]){
     expect(sql).toContain(label);
   }
   expect(sql).toContain("_property.address");
   expect(sql).toContain("_property.area_m2");
   expect(sql).toContain("party_type='proprietario'");
   expect(sql).toContain("party_type='profissional_externo'");
   expect(sql).toContain("status='distribuicao'::public.process_status");
   expect(sql).not.toContain("review_status='aprovado'");
 });
 it("reruns on officialization and document correction with audit",()=>{
   expect(sql).toContain("AFTER UPDATE OF officialized_at ON public.processes");
   expect(sql).toContain("AFTER INSERT OR UPDATE OF file_path,file_size_bytes,is_valid,title ON public.process_documents");
   expect(sql).toContain("Triagem automática — correção solicitada");
   expect(sql).toContain("Triagem automática concluída");
   expect(sql).toContain("enqueue_notification_v1");
 });
 it("prevents admin and other tenant modifications on correction",()=>{
   expect(sql).toContain("public.current_role_code()<>'profissional_externo'");
   expect(sql).toContain("NOT public.has_process_access(_p.id)");
   expect(sql).toContain("_p.created_by_profile_id IS DISTINCT FROM _actor");
   expect(sql).toContain("recheck_my_automatic_triage_v1");
   const ui=read("src/pages/saas/ProcessDetailPage.tsx");
   const desk=read("src/pages/saas/ProtocolDeskPage.tsx");
   expect(ui).toContain('data-automatic-triage-corrections="true"');
   expect(ui).toContain("handleAutomaticTriageDocumentUpload");
   expect(ui).toContain("correctMyPaidProtocol({");
   expect(desk).toContain('data-automatic-triage="true"');
 });
});
