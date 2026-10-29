import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261028_qa_preprotocol_dam_canonical_read_v1.sql","utf8");
describe("QA canonical DAM read after authorized municipal preprotocol recovery",()=>{
 it("cannot leak foreign or orphan processes",()=>{
  for(const fragment of [
   "public.current_profile_id() IS NULL",
   "municipality_id=_municipality_id AND guide_number=_guide_code",
   "public.has_tenant_access(g.municipality_id)",
   "public.has_process_access(g.process_id)",
   "public.qa_pending_dam_municipal_staff_access_v1(g)",
   "pr.municipality_id=g.municipality_id",
   "pr.tenant_id=g.municipality_id",
   "ROW_SECURITY"
  ]) expect(sql.toUpperCase()).toContain(fragment.toUpperCase());
 });
 it("returns canonical read-only guide without payment mutation",()=>{
  expect(sql).toContain("RETURN to_jsonb(g)||jsonb_build_object");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_payment_guide_original_v1");
  expect(sql).toContain("TO authenticated");
  expect(sql).not.toMatch(/\b(?:UPDATE|INSERT|DELETE)\s+public\.payment_guides\b/i);
 });
});