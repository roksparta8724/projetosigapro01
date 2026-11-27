import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const sql=readFileSync("neon/migrations/20261126_zzzzzzzzzzzz_municipal_permit_signature_policy_v1.sql","utf8");
describe("Política de certificados de alvarás",()=>{
 it("keeps history and defaults unchanged and limits administration to the same active municipality",()=>{
  expect(sql).toContain("p.municipality_id=_municipality_id");
  expect(sql).toContain("p.role='prefeitura_admin'");
  expect(sql).toContain("p.account_status='active'");
  expect(sql).toContain("municipal_permit_signature_policy_audit");
  expect(sql).toContain("REVOKE ALL ON public.municipal_permit_signature_policy");
  expect(sql).not.toMatch(/UPDATE public\.(signatures|signature_blocks|processes)\b/i);
 });
 it("denies both certified-required modes at the DB boundary until verified issuance exists",()=>{
  expect(sql).toContain("required_mode IN ('govbr_required','icp_brasil_required')");
  expect(sql).toContain("BEFORE INSERT ON public.signatures");
  expect(sql).toContain("NEW.status IN ('manual_signature','signed')");
  expect(sql).toContain("NEW.status='emitido'");
  expect(sql).toContain("FOR SHARE");
  expect(sql).toContain("FOR UPDATE");
 });
 it("makes the legal reference and blocking consequence explicit to the municipal admin",()=>{
  const ui=readFileSync("src/components/platform/MunicipalPermitSignaturePolicy.tsx","utf8");
  expect(ui).toContain("Ato normativo municipal");
  expect(ui).toContain("window.confirm");
  expect(ui).toContain("set_municipal_permit_signature_policy_v1");
  expect(ui).toContain("Sem política registrada");
 });
});
