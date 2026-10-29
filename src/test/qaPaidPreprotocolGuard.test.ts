import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
describe("Neon QA blocks bank-paid preprotocol draft mutations at database level",()=>{
 const ddl=readFileSync("neon/migrations/20261027_qa_lock_paid_preprotocol_draft_v1.sql","utf8");
 const sql=readFileSync("scripts/qa-paid-preprotocol-edit-rollback.sql","utf8");
 it("retains original officialization, identity and tenant checks",()=>{
  expect(ddl).toContain("_process.officialized_at is not null");
  expect(ddl).toContain("public.has_process_access(_process.id)");
  expect(ddl).toContain("_process.created_by_profile_id is distinct from _profile_id");
 });
 it("also denies paid flag and five bank confirmed status aliases before any draft payload writes",()=>{
  expect(ddl).toContain("guide.guide_kind='protocolo'");
  expect(ddl).toContain("coalesce(guide.paid,false)");
  for(const s of ["compensada","paid","pago","confirmed","confirmado"])expect(ddl).toContain(s);
  expect(ddl.indexOf("Guia inicial com pagamento confirmado")).toBeLessThan(ddl.indexOf("_existing_payload :="));
 });
 it("QA negative test preserves existing guide and never charges a bank",()=>{
  expect(sql).toContain("QA_PAID_DRAFT_BYPASS");
  expect(sql).toContain("QA_ROLLBACK_EXPECTED");
  expect(sql).toContain("status='pago'");
  expect(sql).toContain("provider_environment='test'");
  expect(sql).not.toMatch(/\b(delete\s+from|truncate\s+table|drop\s+table)\b/i);
 });
});