import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
describe("SQL de aceitação da guia original: QA estritamente reversível",()=>{
 const text=readFileSync("scripts/qa-guide-original-archive-rollback.sql","utf8");
 it("exige guia real de sandbox e mantém o ambiente oficial fora do caminho",()=>{
   expect(text).toContain("br-solitary-sound-b4xlbvs6");
   expect(text).toContain("provider_environment='test'");
   expect(text).toContain("payment_provider='mercado_pago'");
   expect(text).toContain("DAM-PRE-20261022-7791A2E9");
   expect(text).toContain("document_snapshot IS NULL");
 });
 it("comprova titularidade e isolamento municipal no contrato SQL",()=>{
   expect(text).toContain("foreign_identity.subject_id");
   expect(text).toContain("owner_identity.subject_id");
   expect(text).toContain("QA_FOREIGN_ARCHIVE_ACCEPTED");
   expect(text).toContain("freeze_payment_guide_document_v1");
   expect(text).toContain("attach_payment_guide_original_v1");
 });
 it("não transmite cobrança nem cria PDF falso persistente",()=>{
   expect(text).toContain("QA_ORIGINAL_ARCHIVE_ROLLBACK");
   expect(text).toContain("QA guide archive fixture did not roll back");
   expect(text).not.toMatch(/\b(delete\s+from|truncate|drop\s+table)\b/i);
   expect(text).not.toContain("UPDATE public.payment_guides");
 });
});