import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const sql=readFileSync("neon/migrations/20261110_habite_se_signed_document_and_completion.sql","utf8");

describe("SIGAPRO Habite-se: signed document is immutable evidence",()=>{
 it("an issued permit displays the EXACT director-signed form, never current defaults",()=>{
  expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_habite_se_permit_v1");
  expect(sql).toContain("join public.signatures s on s.signature_block_id=b.id");
  expect(sql).toContain("b.artifact_payload->>'permitNumber'=_permit.permit_number");
  expect(sql).toContain("b.artifact_payload->'formData' into _signed_form");
  expect(sql).toContain("jsonb_set(to_jsonb(_permit),'{form_data}',_signed_form,true)");
  expect(sql).toContain("Alvará emitido sem cópia assinada e verificável");
 });
 it("an archive requires a director signature, bank-attested settlement or municipal manual evidence",()=>{
  expect(sql).toContain("CREATE OR REPLACE FUNCTION public.complete_habite_se_process_v1");
  expect(sql).toContain("_director_signature_valid");
  expect(sql).toContain("A assinatura eletrônica verificável da Diretoria é obrigatória");
  expect(sql).toContain("_habite_guide_valid");
  expect(sql).toContain("g.original_pdf_sha256");
  expect(sql).toContain("g.bank_authenticated_at is not null");
  expect(sql).toContain("in ('production','prod','live')");
  expect(sql).toContain("'prefeitura_admin','admin_prefeitura','admin_municipality'");
  expect(sql).toContain("status='arquivado'::public.process_status");
 });
 it("the migration is additive and never deletes original payments or signatures",()=>{
  expect(sql).toContain("BEGIN;");
  expect(sql).toContain("COMMIT;");
  expect(sql).not.toMatch(/DROP TABLE|DELETE FROM public|TRUNCATE/);
 });
});
