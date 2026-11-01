import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261101_urban_precheck_legal_evidence_strict_qa_v1.sql","utf8");
const client=readFileSync("src/integrations/backend/urbanPrecheckClient.ts","utf8");
describe("SIGAPRO QA – database veto on ungrounded urbanistic prechecks",()=>{
 it("requires scoped evidence per metric and active legal version before v5 history",()=>{
  expect(sql).toContain("CREATE OR REPLACE FUNCTION public.save_urban_precheck_run_v6");
  expect(sql).toContain("jsonb_array_elements(_version.rules) m(rule)");
  expect(sql).toContain("s.municipality_id=_version.municipality_id");
  expect(sql).toContain("s.effective_from<=_reference_date");
  expect(sql).toContain("s.verification_method IN");
  expect(sql).toContain("status='active'");
  expect(sql).toContain("public.save_urban_precheck_run_v5(");
  expect(sql).not.toContain("activate_urban_regulation");
  expect(client).toContain('"save_urban_precheck_run_v6"');
 });
 it("keeps permissions and prevents anonymous callers",()=>{
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.save_urban_precheck_run_v6");
  expect(sql).toContain("FROM anon;");
  expect(sql).toContain("TO authenticated;");
 });
});
