import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261028_guard_manual_settlement_provider_v1.sql","utf8");
const finance=readFileSync("src/pages/saas/FinanceDeskPage.tsx","utf8");
describe("manual settlement cannot bypass a bank's verified credit",()=>{
 it("keeps the exact existing RPC contract and locks the guide before provider check",()=>{
   expect(sql).toContain("CREATE OR REPLACE FUNCTION public.confirm_process_payment_guide(_process_id uuid, _guide_kind text)");
   expect(sql).toContain("FOR UPDATE;");
   expect(sql).toContain("_guide.payment_provider");
   expect(sql).toContain("_guide.bank_reference");
   expect(sql).toContain("Pagamento bancario vinculado: confirmacao manual bloqueada");
 });
 it("runs the bank guard BEFORE any paid/settled mutation",()=>{
   const guard=sql.indexOf("Pagamento bancario vinculado: confirmacao manual bloqueada");
   const write=sql.indexOf("UPDATE public.payment_guides");
   expect(guard).toBeGreaterThan(0);
   expect(write).toBeGreaterThan(guard);
 });
 it("allows manual or bank-direct finance workflows without forging a payment callback",()=>{
   expect(sql).toContain("('manual','bank_direct','municipal_system')");
   expect(sql).toContain("_role_code='financeiro'");
 });
 it("does not display the manual-pay action for bank-connected guides",()=>{
   expect(finance).toContain('guide.paymentProvider !== "mercado_pago"');
   expect(finance).toContain('guide.bankReference && !guide.paymentProvider');
 });
 it("never mutates an existing guide as part of the migration",()=>{
   expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.payment_guides/i);
   expect(sql).not.toMatch(/TRUNCATE\s+public\.payment_guides/i);
 });
});
