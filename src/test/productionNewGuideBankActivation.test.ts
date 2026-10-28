import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const bank=readFileSync("server/mercadopago.ts","utf8");
const original=readFileSync("src/lib/guideOriginal.ts","utf8");
describe("municipal production charges require bank webhook and PDF-backed retries",()=>{
 it("blocks new production charge until signed webhook and worker are configured",()=>{
  expect(bank).toContain('resolved.connection?.webhook_secret_ciphertext');
  expect(bank).toContain('SIGAPRO_PROD_MP_WEBHOOK_DATABASE_URL');
  expect(bank).toContain('environment === "production"');
 });
 it("rechecks only the SAME signed order once original is stored",()=>{
  expect(original).toContain('recheckSignedOrderAfterPdf(original)');
  expect(original).toContain('mode=post-archive-reconcile');
  expect(original).toContain('provider_environment !== "production"');
  expect(original).toContain('original.original_pdf_key');
  expect(original).not.toContain('qa_mp_pix_reserve_v2');
 });
});
