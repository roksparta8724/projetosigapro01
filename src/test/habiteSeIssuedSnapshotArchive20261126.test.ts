import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const sql=readFileSync("neon/migrations/20261126_zzzzzzzzzzzzzzzzzz_habite_se_signed_issuance_archive_v1.sql","utf8");
describe("Habite-se issued snapshot and archive",()=>{
 it("binds the historical document to a unique signature and actual issuance identity",()=>{
  for(const token of ["count(DISTINCT b.id)=1","s.signer_profile_id=h.director_profile_id","s.signed_at=h.issued_at","s.document_hash=b.evidence_hash","s.reauthenticated_at IS NOT NULL","b.tenant_id=p.tenant_id","REVOKE ALL ON FUNCTION private.issued_habite_se_signature_block_v1"])expect(sql).toContain(token);
 });
 it("keeps new issuance strict and never silently rewrites signed or draft content",()=>{
  expect(sql).toContain("b.artifact_payload->'formData'=_permit.form_data");
  expect(sql).toContain("Versão assinada do Habite-se preservada");
  expect(sql).not.toMatch(/UPDATE public\.signature_blocks/i);
  expect(sql).toContain("jsonb_set(to_jsonb(_permit),'{form_data}',_block.artifact_payload->'formData',true)");
 });
});
