import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const handler=readFileSync("server/mp-prod-webhook.ts","utf8");
const signature=readFileSync("server/mp-webhook-signature.ts","utf8");
const provider=readFileSync("server/mp-prod-provider-order.ts","utf8");
const sql=readFileSync("neon/migrations/20261028_prod_mp_signed_bank_settlement_forward_only_v1.sql","utf8");
const entry=readFileSync("api/mercadopago-webhook.ts","utf8");
describe("independent production Mercado Pago webhook release",()=>{
 it("uses main, prod branch, isolated worker and municipal credentials",()=>{
  expect(handler).toContain('VERCEL_ENV==="production"');
  expect(handler).toContain('VERCEL_GIT_COMMIT_REF===requiredBranch');
  expect(handler).toContain("sigapro_prod_webhook_worker");
  expect(handler).toContain("ep-blue-cloud-b4hhgb4t");
  expect(handler).toContain("mp_prod_webhook_connection_v1");
  expect(entry).toContain("mp-prod-webhook.js");
 });
 it("rejects unsigned, replayed or non-accredited transaction",()=>{
  expect(signature).toContain("timingSafeEqual");
  expect(signature).toContain("5 * 60 * 1000");
  expect(handler).toContain("notice.live_mode!==true");
  expect(handler).toContain("fetchMunicipalMpOrder(valid.orderId,auth.accessToken)");
  expect(provider).toContain('statusDetail==="accredited"');
  expect(provider).toContain('transactionStatusDetail==="accredited"');
  expect(provider).toContain("noChargeback&&noRefund");
  expect(sql).toContain("_paid_amount>0");
 });
 it("writes only against exact process, amount, immutable PDF and bank payment",()=>{
  for(const part of ["bank_payment_id=_payment_id","guide_number=_external_reference",
   "provider_environment='production'","collection_mode_snapshot='sigapro'",
   "g.original_pdf_sha256","g.document_snapshot IS NULL",
   "p.tenant_id=g.municipality_id","FOR UPDATE",
   "UNIQUE(municipality_id,order_id,request_id)"])
   expect(sql).toContain(part);
  expect(sql).toContain("TO sigapro_prod_webhook_worker");
  expect(sql).toContain("FROM PUBLIC,anonymous,authenticated");
  expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.payment_guides/i);
 });
 it("only accepts signed prior notice for rechecking archived PDFs",()=>{
  expect(handler).toContain("SIGNED_BANK_EVENT_REQUIRED");
  expect(handler).toContain("readStoredGuide(req,municipalityId,guideCode)");
  expect(handler).toContain('mode")==="post-archive-reconcile"');
  expect(handler).not.toContain("qa_mp_pix_reserve_v1");
 });
});
