import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const sql=readFileSync("neon/migrations/20261126_zzzzzzzzzzzzzzzz_qa_webhook_preserve_settlement_receipt_v1.sql","utf8");
describe("QA bank receipt preservation",()=>{
 it("locks the receipt before checking immutable settlement evidence",()=>{
  expect(sql.indexOf("FOR UPDATE;")).toBeLessThan(sql.indexOf("x.signed_receipt_id=receipt.id"));
  expect(sql).toContain("ON CONFLICT(municipality_id,order_id,request_id) DO NOTHING");
  expect(sql).toContain("receipt.payload_sha256 IS DISTINCT FROM _payload_sha256");
 });
 it("preserves the credited observation and does not report a noncredit retry as matched",()=>{
  const guard=sql.slice(sql.indexOf("IF EXISTS(SELECT 1 FROM public.mp_qa_settlement_evidence_v1"),sql.indexOf("  ELSE\n   UPDATE public.mp_webhook_order_events_v1"));
  expect(guard).toContain("attempt_count=least");
  expect(guard).not.toContain("guide_id=");
  expect(guard).toContain("response_status:='unmatched_manual_review'");
  expect(sql).toContain("guide_amount=_provider_amount");
  expect(sql).not.toMatch(/UPDATE public\.payment_guides/);
 });
});
