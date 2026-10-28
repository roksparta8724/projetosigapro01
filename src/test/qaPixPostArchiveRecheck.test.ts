import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const api=readFileSync("server/qa-mercadopago-reconcile.ts","utf8");
const sql=readFileSync("neon/migrations/20261028_qa_reconcile_existing_signed_order_v1.sql","utf8");
const page=readFileSync("src/pages/saas/ExternalPaymentsPage.tsx","utf8");
const client=readFileSync("src/lib/mercadoPagoGuide.ts","utf8");
const vercel=readFileSync("vercel.json","utf8");
describe("QA post-original bank reconciliation workflow",()=>{

 it("reuses an existing Vercel function instead of exceeding Hobby 12-function quota",()=>{
   const webhook=readFileSync("api/mercadopago-webhook.ts","utf8");
   expect(webhook).toContain('qaReconcileArchivedOriginal');
   expect(webhook).toContain('mode")==="post-archive-reconcile"');
   expect(vercel).toContain('"/api/mercadopago-webhook?mode=post-archive-reconcile"');
 });
 it("never creates new bank orders or unsigned receipt evidence",()=>{
  expect(api).toContain("mp_qa_webhook_signed_receipt_v1");
  expect(api).toContain("fetchMunicipalMpOrder(guide.bank_reference!");
  expect(api).toContain("persistQaOrderEvent");
  expect(api).toContain("if(!observation.accredited)");
  expect(api).not.toContain("X-Idempotency-Key");
  expect(api).not.toContain("qa_mp_pix_reserve_v2");
  expect(sql).not.toContain("UPDATE public.payment_guides");
 });
 it("requires a genuine signed tenant event and the archived original SHA",()=>{
  expect(sql).toContain("signature_verified=true");
  expect(sql).toContain("public.has_tenant_access(_municipality_id)");
  expect(sql).toContain("public.has_process_access(g.process_id)");
  expect(sql).toContain("g.original_pdf_sha256");
  expect(sql).toContain("o.order_id=_order_id");
  expect(sql).toContain("TO sigapro_qa_webhook_worker");
  expect(api).toContain("readBearer(req)");
  expect(api).toContain("qaWebhookConfigured()");
 });
 it("reuses the status button and existing JWT after archive",()=>{
  expect(page).toContain("original.original_pdf_key && original.original_pdf_sha256");
  expect(page).toContain("await reconcileQaPixAfterPdf");
  expect(client).toContain('"/api/qa/mercadopago/guide-reconcile"');
  expect(vercel).toContain('"/api/qa-mercadopago-reconcile"');
 });
});
