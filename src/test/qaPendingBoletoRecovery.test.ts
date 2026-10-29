import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const front=readFileSync("src/pages/saas/ExternalPaymentsPage.tsx","utf8");
const server=readFileSync("server/mercadopago.ts","utf8");
const guide=readFileSync("server/guide-persistence.ts","utf8");

describe("QA pending Mercado Pago boleto recovery must never POST a second order",()=>{
  const client=front.slice(front.indexOf("const issueSandboxBoleto = async"),front.indexOf("const issueSandboxPix = async"));
  const backend=server.slice(server.indexOf("export async function createMercadoPagoGuideBoleto("));
  it("checks canonical municipality/process, paid status and saved PDF before provider access",()=>{
    expect(client.indexOf("const current = await readGuideOriginal")).toBeLessThan(client.indexOf("const existingOrder"));
    expect(client).toContain("current.process_id !== process.id");
    expect(client).toContain("current.municipality_id !== effectiveScopeId");
    expect(client.indexOf("if (isGuideSettled(current))")).toBeLessThan(client.indexOf("const existingOrder"));
    expect(client).toContain("if (current.original_pdf_key)");
  });
  it("does not reissue when codes are already complete and never trusts another provider's bank reference",()=>{
    expect(client).toContain("if (savedCodes.barcode && savedCodes.digitableLine)");
    expect(client).toContain('current.payment_provider !== "mercado_pago"');
    expect(client).toContain('current.provider_environment !== "test"');
    expect(client).toContain("nenhuma nova cobrança foi emitida");
  });
  it("the very same order is re-fetched by GET, not recreated, when barcode is pending",()=>{
    const persistedCheck=backend.indexOf("if (stored.bank_reference) {");
    const existingGet=backend.indexOf("return getMercadoPagoGuideBoletoStatus(",persistedCheck);
    const createOrder=backend.indexOf("const idempotencyKey",existingGet);
    expect(persistedCheck).toBeGreaterThan(0);
    expect(existingGet).toBeGreaterThan(persistedCheck);
    expect(createOrder).toBeGreaterThan(existingGet);
    expect(backend.slice(existingGet,createOrder)).toContain("orderId: stored.bank_reference");
    expect(guide).toContain("qa_authorize_payment_guide_provider_sync_v1");
    expect(guide).toContain("persisted.bank_reference !== charge.orderId");
    expect(client).toContain("const persisted = await readGuideOriginal(effectiveScopeId, guide.code)");
    expect(client).toContain("verifyPersistedQaBoleto({");
  });
});
