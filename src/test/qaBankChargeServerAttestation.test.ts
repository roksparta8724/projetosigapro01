import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { assertBankChargeAttestationReady, signVerifiedBankCharge, type StoredGuide } from "../../server/guide-persistence";

const fixture = {
  id: "7d751ec9-00ce-46d0-8000-440000000001",
  municipality_id: "7d751ec9-00ce-46d0-8000-440000000002",
  process_id: "7d751ec9-00ce-46d0-8000-440000000003",
  guide_number: "QA-CHARGE-VERIFIED",
  amount: 10, due_date: "2026-12-01", created_at: "2026-10-27",
  status: "pending",
} as StoredGuide;
const receipt = {
  ok: true, environment: "test" as const,
  externalReference: fixture.guide_number, amount: "10.00",
  orderId: "order-verified-only", paymentId: "payment-verified",
  status: "action_required", statusDetail: "pending",
  authenticatedAt: "", barcodeContent: "", digitableLine: "",
  ticketUrl: "https://example.test/boleto",
};
const previousSecret = process.env.SIGAPRO_BANK_CHARGE_SIGNING_SECRET;
afterEach(() => {
  if (previousSecret === undefined) delete process.env.SIGAPRO_BANK_CHARGE_SIGNING_SECRET;
  else process.env.SIGAPRO_BANK_CHARGE_SIGNING_SECRET = previousSecret;
});

describe("SIGAPRO provider-attested charge", () => {
  it("fails closed before an API server creates an unarchivable bank charge", () => {
    delete process.env.SIGAPRO_BANK_CHARGE_SIGNING_SECRET;
    expect(() => assertBankChargeAttestationReady()).toThrow(/não configurada/);
  });
  it("binds amount, municipality, reference, provider details and a short-lived timestamp", () => {
    process.env.SIGAPRO_BANK_CHARGE_SIGNING_SECRET = "a".repeat(64);
    const result = signVerifiedBankCharge(fixture, receipt);
    const parts = [
      "sigapro-charge-v1", fixture.municipality_id, fixture.guide_number,
      receipt.externalReference, receipt.amount, receipt.orderId, receipt.environment,
      receipt.paymentId, receipt.status, receipt.statusDetail, receipt.authenticatedAt,
      receipt.barcodeContent, receipt.digitableLine, receipt.ticketUrl,
      result.__receipt_epoch,
    ];
    const expected = createHmac("sha256", Buffer.from("a".repeat(64), "hex"))
      .update(parts.join("\n"), "utf8").digest("hex");
    expect(result.__receipt_mac).toBe(expected);
    expect(result.__receipt_epoch).toMatch(/^[0-9]{10,11}$/);
    expect(receipt).not.toHaveProperty("__receipt_mac");
  });
  it("never attests a response for another guide or amount", () => {
    process.env.SIGAPRO_BANK_CHARGE_SIGNING_SECRET = "b".repeat(64);
    expect(() => signVerifiedBankCharge(fixture, { ...receipt, amount: "12.00" })).toThrow(/coerente/);
    expect(() => signVerifiedBankCharge(fixture, { ...receipt, externalReference: "OTHER" })).toThrow(/coerente/);
    expect(() => signVerifiedBankCharge(fixture, { ...receipt, ticketUrl: "https://example.test/\nforged" })).toThrow(/controle/);
  });
});
