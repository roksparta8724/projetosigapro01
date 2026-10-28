import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const prod=readFileSync("server/mp-prod-webhook.ts","utf8");
const edge=readFileSync("api/mercadopago-webhook.ts","utf8");
const sql=readFileSync("neon/migrations/20261028_prod_mp_signed_bank_settlement_forward_only_v1.sql","utf8");
describe("production bank settlements are separate, idempotent and signed",()=>{
 it("requires exact production branch and pinned compute/role",()=>{
  expect(prod).toContain('VERCEL_ENV==="production"');
  expect(prod).toContain('VERCEL_GIT_COMMIT_REF===requiredBranch');
  expect(prod).toContain('sigapro_prod_webhook_worker');
  expect(prod).toContain('ep-blue-cloud-b4hhgb4t');
  expect(prod).toContain('SIGAPRO_PROD_MP_WEBHOOK_DATABASE_URL');
  expect(edge).toContain('if(process.env.VERCEL_ENV==="production")return productionWebhook(req,res);');
 });
 it("checks full provider credit and HMAC before SQL settlement",()=>{
  expect(prod).toContain('verifyMercadoPagoOrderWebhook');
  expect(prod).toContain('notice.live_mode!==true');
  expect(prod).toContain('fetchMunicipalMpOrder(valid.orderId,auth.accessToken)');
  expect(prod).toContain('o.accredited===true');
  expect(sql).toContain("_order_status='processed' AND _order_detail='accredited'");
  expect(sql).toContain("_transaction_status='processed' AND _transaction_detail='accredited'");
  expect(sql).toContain("coalesce(_no_refunds_or_chargebacks,false)");
 });
 it("locks exact tenant, process, order, payment, PDF and requires production bank",()=>{
  for(const fragment of ["g.bank_reference IS NULL","guide_number=_external_reference",
    "bank_payment_id=_payment_id","provider_environment='production'",
    "collection_mode_snapshot='sigapro'","g.original_pdf_sha256",
    "g.document_snapshot IS NULL","g.original_pdf_key IS DISTINCT FROM",
    "p.municipality_id=g.municipality_id","FOR UPDATE"])
   expect(sql).toContain(fragment);
  expect(sql).toContain('UNIQUE(municipality_id,order_id,request_id)');
  expect(sql).toContain('UNIQUE(municipality_id,provider_payment_id)');
 });
 it("browser may never call privileged worker RPC",()=>{
  expect(sql).toContain('TO sigapro_prod_webhook_worker');
  expect(sql).toContain('FROM PUBLIC,anonymous,authenticated');
  expect(prod).toContain('readStoredGuide(req,municipalityId,guideCode)');
  expect(prod).toContain('SIGNED_BANK_EVENT_REQUIRED');
  expect(prod).toContain('mp_prod_signed_order_receipts_v1');
  expect(prod).not.toContain('qa_mp_pix_reserve_v1');
  expect(prod).not.toContain('X-Idempotency-Key');
 });
});
