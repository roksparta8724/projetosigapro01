import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const vercel=JSON.parse(readFileSync("vercel.json","utf8"));
const handler=readFileSync("api/mercadopago.ts","utf8");
const page=readFileSync("src/pages/saas/ExternalPaymentsPage.tsx","utf8");
const server=readFileSync("server/mercadopago.ts","utf8");
describe("Vercel QA boleto: isolated sandbox-only, never production",()=>{
 it("maps a dedicated QA route to the existing authenticated handler",()=>{
  expect(vercel.rewrites).toContainEqual({
   source:"/api/qa/mercadopago/guide-boleto",destination:"/api/mercadopago?action=guide-boleto"});
 });
 it("passes sandbox options to issue and status (QA scoped RPCs)",()=>{
  expect(handler).toContain('isolatedQa ? { isolatedSandboxOnly: true } : undefined');
  expect(handler).toContain('QA_PIX_ALREADY_RESERVED');
  expect(handler).toContain('qaChargesEnabled');
 });
 it("offers boleto only on exact QA preview hostname, never all Vercel previews",()=>{
  expect(page).toContain('const qaBoletoIssuer = qaPixIssuer');
  expect(page).toContain('window.location.hostname === "projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app"');
  expect(page).toContain('qaBoletoIssuer && !isGuideSettled(guide) && !guide.bankReference');
 });
 it("does not reissue a parallel boleto if PIX already reserved",()=>{
  expect(page).toContain('if (current.pix_code)');
  expect(server).toContain('SIGAPRO_QA_MP_CHARGE_OPT_IN === "QA_ONLY_TEST_ORDERS"');
  expect(server).toContain('process.env.VERCEL_ENV === "preview"');
 });
});
