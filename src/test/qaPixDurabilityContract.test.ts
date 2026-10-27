import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
const server=readFileSync("api/qa-mercadopago-pix.ts","utf8");
const sql=readFileSync("neon/migrations/20261027_qa_mp_pix_order_inbox_v1.sql","utf8");
const rewrites=readFileSync("vercel.json","utf8");
describe("QA PIX durable integration security contract",()=>{
 it("routes preview QR issue to a real serverless handler",()=>{
  expect(rewrites).toContain("/api/qa/mercadopago/guide-pix");
  expect(rewrites).toContain("/api/qa-mercadopago-pix");
  expect(readFileSync("api/mercadopago.ts","utf8")).toContain("QA_PIX_ALREADY_RESERVED");
  expect(server).toContain("qa_mp_pix_reserve_v2");
  expect(server).toContain("qa_mp_pix_get_v1");
  expect(server).toContain("qa_mp_pix_save_v2");
 });
 it("does not emit charges without isolated TEST opt-in",()=>{
  expect(server).toContain("SIGAPRO_QA_MP_CHARGE_OPT_IN");
  expect(server).toContain("QA_ONLY_TEST_ORDERS");
  expect(server).toContain('process.env.VERCEL_ENV==="preview"');
  expect(server).toContain('process.env.VITE_SIGAPRO_NEON_ISOLATED==="true"');
 });
 it("keeps idempotency and tenant unique from a permanent Neon reservation",()=>{
  expect(sql).toContain("UNIQUE(municipality_id,guide_number)");
  expect(sql).toContain("guide_id uuid NOT NULL UNIQUE");
  expect(sql).toContain("FOR UPDATE");
  expect(server).not.toContain('"X-Idempotency-Key":key');
  expect(server).toContain("QA_PIX_ORDER_CREATION_UNCERTAIN");
  expect(server).toContain("signQaPixProof");
  expect(sql).toContain("Guia com boleto ou outra cobrança: PIX paralelo bloqueado");
 });
 it("GET never creates a reservation or makes a provider POST",()=>{
  expect(server).toContain('if(action==="get"){');
  expect(server).toContain('if(!existing.payload)return send(res,200');
  expect(sql).toContain("FUNCTION public.qa_mp_pix_get_v1");
 });
 it("does not mark guides paid or disable RLS",()=>{
  expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("REVOKE ALL");
  expect(sql).not.toMatch(/\bSET\s+paid\s*=/i);
  expect(sql).not.toContain("UPDATE public.payment_guides SET");
  expect(server).not.toMatch(/automaticSettlement:\s*true/);
 });
});