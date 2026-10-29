import { describe, expect, it } from "vitest";
import { verifyPersistedQaBoleto } from "./qaGuideBankConfirmation";
import type { GuideOriginal } from "./guideOriginal";
import type { MercadoPagoGuideCharge } from "./mercadoPagoGuide";

const barcode = "23791684000003000003388060601573644066333333";
const digitableLine = "23793388096060157364540663333335168400000300000";
const original: GuideOriginal = {
  id: "guide-qa", municipality_id: "municipality-qa", process_id: "process-qa",
  guide_number: "DAM-QA-0001", status: "pendente", paid: false,
  amount: 35.24, created_at: "2026-10-26T12:00:00.000Z", due_date: "2026-10-31",
  provider_environment: "test", payment_provider: "mercado_pago",
  bank_reference: "ORDTST-1234", barcode, digitable_line: digitableLine,
};
const charge: MercadoPagoGuideCharge = {
  ok: true, environment: "test", orderId: "ORDTST-1234",
  barcodeContent: barcode, digitableLine,
};
const input = {
  municipalityId: "municipality-qa", processId: "process-qa",
  guideCode: "DAM-QA-0001", amount: 35.24, original, charge,
};
describe("QA boleto: persisted bank confirmation", () => {
  it("accepts only the authenticated QA bank order saved to exactly that process", () => {
    expect(() => verifyPersistedQaBoleto(input)).not.toThrow();
  });
  it.each([
    ["foreign municipality", { municipality_id: "foreign-tenant" }, {}],
    ["foreign process", { process_id: "foreign-process" }, {}],
    ["wrong guide", { guide_number: "DAM-QA-OTHER" }, {}],
    ["different order", { bank_reference: "ORDTST-DUPLICATE" }, {}],
    ["production order", { provider_environment: "production" }, {}],
    ["other payment provider", { payment_provider: "municipal_system" }, {}],
    ["paid flag", { paid: true }, {}],
    ["compensated status", { status: "compensada" }, {}],
    ["confirmed payment status", { status: "confirmed" }, {}],
    ["mismatched amount", { amount: 999 }, {}],
    ["zero amount", { amount: 0 }, {}],
    ["invalid persisted barcode", { barcode: "1".repeat(44) }, {}],
    ["invalid persisted line", { digitable_line: "2".repeat(47) }, {}],
    ["missing bank reference", { bank_reference: "" }, {}],
    ["rejected gateway response", {}, { ok: false }],
    ["fake production response", {}, { environment: "production" }],
    ["stale gateway order", {}, { orderId: "ORDTST-OLDER" }],
    ["barcode tampered in response", {}, { barcodeContent: "1".repeat(44) }],
    ["missing gateway line", {}, { digitableLine: "" }],
  ] as const)("blocks %s instead of falsely reporting a bank issuance", (_case, stored, gateway) => {
    expect(() => verifyPersistedQaBoleto({
      ...input,
      original: { ...original, ...stored } as GuideOriginal,
      charge: { ...charge, ...gateway } as MercadoPagoGuideCharge,
    })).toThrow(/não foi confirmada/);
  });
  it("rejects non-finite or otherwise invalid amounts", () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
      expect(() => verifyPersistedQaBoleto({ ...input, amount })).toThrow();
    }
  });
});
