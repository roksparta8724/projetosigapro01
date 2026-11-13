import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const sql=readFileSync("neon/migrations/20261104_municipal_urban_writer_authorization_v1.sql","utf8");
describe("Municipal legislative responsibility is enforced by Neon RPCs",()=>{
 it("requires Admin Prefeitura and own-tenant membership on every urban writer",()=>{
  for(const name of ["activate_urban_regulation_v1","activate_urban_regulation_v2","record_urban_matrix_reading_action_v2","save_urban_legal_evidence_scoped_v2","save_urban_legal_evidence_scoped_v3","save_urban_legal_evidence_scoped_v4","save_urban_legal_evidence_v1","save_urban_legal_matrix_import_v1","save_urban_matrix_batch_staging_v1","save_urban_quadro_ii_draft_entry_v1"]){
   const idx=sql.indexOf("CREATE OR REPLACE FUNCTION public."+name+"(");
   expect(idx).toBeGreaterThan(0);
   const body=sql.slice(idx,sql.indexOf("CREATE OR REPLACE FUNCTION public.",idx+10)<0?
     sql.length:sql.indexOf("CREATE OR REPLACE FUNCTION public.",idx+10));
   expect(body).toContain("current_role_code() IS DISTINCT FROM 'prefeitura_admin'");
   expect(body).toContain("has_tenant_access(");
  }
  expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.activate_urban_regulation_v1(uuid) FROM authenticated");
  expect(sql).not.toContain("DELETE FROM");
  expect(sql).not.toContain("UPDATE public.urban_regulation_versions SET status='active'");
 });
});
