import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261028_qa_mp_accredited_settlement_v1.sql","utf8");
describe("QA municipal settlement SQL bank controls",()=>{
 it("is QA only, not public callable, and preserves immutable originals",()=>{
  expect(sql).toContain("QA EXCLUSIVE");
  expect(sql).toContain("br-solitary-sound-b4xlbvs6");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.mp_qa_webhook_settle_v1");
  expect(sql).toContain("TO sigapro_qa_webhook_worker");
  expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/i);
  expect(sql).toContain("g.original_pdf_sha256");
  expect(sql).toContain("g.original_pdf_key");
  expect(sql).toContain("awaiting_original_pdf");
 });
 it("demands signed persisted provider receipt and full credit at both levels",()=>{
  for(const check of ["signature_verified=true","provider_fetch_succeeded=true",
   "provider_status='processed'","currency='BRL'","reconciliation_status='verified_manual_review'",
   "_status_detail IS DISTINCT FROM 'accredited'","_transaction_status IS DISTINCT FROM 'processed'",
   "_transaction_detail IS DISTINCT FROM 'accredited'","_paid_amount IS DISTINCT FROM e.provider_amount",
   "_transaction_paid_amount"]) expect(sql).toContain(check);
 });
 it("cannot match a different tenant, order, payment id, process or transaction amount",()=>{
  for(const check of ["municipality_id=_municipality_id","bank_reference=_order_id",
   "bank_payment_id=_payment_id","provider_environment='test'",
   "collection_mode_snapshot='sigapro'","guide_number=e.external_reference",
   "payment_id=_payment_id","qr_code=g.pix_code","p.municipality_id=g.municipality_id",
   "amount=_paid_amount"])expect(sql).toContain(check);
 });
 it("is atomic and idempotent; changes only an authorized unpaid guide",()=>{
  expect(sql).toContain("UNIQUE(municipality_id,provider_order_id)");
  expect(sql).toContain("UNIQUE(municipality_id,provider_payment_id)");
  expect(sql).toContain("ON CONFLICT(guide_id) DO NOTHING");
  expect(sql).toContain("FOR UPDATE");
  expect(sql).toContain("UPDATE public.payment_guides SET");
  expect(sql).toContain("paid=true,status='compensada'");
  expect(sql).toContain("paid=false");
  expect(sql).not.toContain("UPDATE public.processes SET");
 });
});
