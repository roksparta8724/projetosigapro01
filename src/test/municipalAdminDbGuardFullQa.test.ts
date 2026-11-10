import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const sql=readFileSync(
 "neon/migrations/20261109_complete_prefeitura_admin_process_readonly_qa.sql","utf8");
describe("SIGAPRO — proteção final do Admin municipal nas tabelas de processos",()=>{
 it("nega escrita em processos e anexos, inclusive nas tabelas documentais e assinaturas",()=>{
  expect(sql).toContain("CREATE OR REPLACE FUNCTION public.prevent_municipal_admin_process_write_v1()");
  expect(sql).toContain("SECURITY DEFINER");
  expect(sql).toContain("SET search_path TO 'pg_catalog','public'");
  expect(sql).toContain("ERRCODE='42501'");
  for(const role of ["prefeitura_admin","admin_prefeitura","admin_municipality"])
   expect(sql).toContain("'"+role+"'");
  for(const table of [
    "processes","payment_guides","process_documents","process_audit_entries",
    "interdepartmental_dispatches","process_analysis_sheets",
    "process_habite_se_inspections","process_habite_se_inspection_photos",
    "process_habite_se_permits","process_construction_permits",
    "process_signature_requests","signature_blocks","process_urban_precheck_runs",
    "process_artifact_withdrawals","process_parties",
  ])expect(sql).toContain("'"+table+"'");
  expect(sql).toContain("BEFORE INSERT OR UPDATE OR DELETE");
  expect(sql).toContain("FOR EACH ROW EXECUTE FUNCTION public.prevent_municipal_admin_process_write_v1()");
  expect(sql).toContain("IF NOT EXISTS");
 });
 it("preserva a competência do Admin municipal para legislações, não processos",()=>{
  for(const legal of ["urban_legislation_documents","urban_legal_evidence_scopes",
    "urban_regulation_versions","municipalities","profiles","tenant_memberships"]){
    expect(sql).not.toContain("'"+legal+"',");
  }
  expect(sql).not.toMatch(/\bTRUNCATE\b|\bDELETE FROM\b|\bDROP TABLE\b/);
 });
});
