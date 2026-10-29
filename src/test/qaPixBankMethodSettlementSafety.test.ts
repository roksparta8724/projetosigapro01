import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMunicipalMpOrder } from "../../server/mp-webhook-tenant";

const orderId = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
const paymentId = "PAY01JQ4S4KY8HWQ6NA5PXB65B3D3";
const token = "TEST_STUB_TOKEN";

function bankOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    external_reference: "DAM-PRE-QA-TEST-001",
    type: "online",
    country_code: "BRA",
    currency: "BRL",
    status: "processed",
    status_detail: "accredited",
    total_amount: "1.00",
    total_paid_amount: "1.00",
    transactions: {
      payments: [{
        id: paymentId,
        status: "processed",
        status_detail: "accredited",
        amount: "1.00",
        paid_amount: "1.00",
        payment_method: { id: "pix", type: "bank_transfer" },
      }],
      chargebacks: [],
      refunds: [],
    },
    ...overrides,
  };
}

function withPayments(value: unknown[]) {
  return bankOrder({ transactions: { payments: value, chargebacks: [], refunds: [] } });
}

function mockBankReply(value: Record<string, unknown>, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    new Response(JSON.stringify(value), { status }),
  ));
}

beforeEach(() => mockBankReply(bankOrder()));
afterEach(() => vi.unstubAllGlobals());

describe("QA Mercado Pago bank confirmation is PIX-specific, not just a paid amount", () => {
  it("accepts one actual accredited PIX bank transfer with all matching cents", async () => {
    const observed = await fetchMunicipalMpOrder(orderId, token);
    expect(observed).toMatchObject({
      fetched: true, status: "processed", paymentId, currency: "BRL",
      paidAmount: 1, amount: 1, accredited: true,
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "https://api.mercadopago.com/v1/orders/" + orderId,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each([
    ["boleto", { id: "boleto", type: "ticket" }],
    ["card", { id: "visa", type: "credit_card" }],
    ["different transfer", { id: "ted", type: "bank_transfer" }],
    ["missing method", null],
  ])("never settles an accredited %s response as PIX", async (_name, method) => {
    const payments = (bankOrder().transactions.payments).map(p => ({
      ...p, payment_method: method,
    }));
    mockBankReply(withPayments(payments));
    const observed = await fetchMunicipalMpOrder(orderId, token);
    expect(observed.fetched).toBe(true);
    expect(observed.accredited).toBe(false);
  });

  it("rejects split or duplicated payments even when both claim accreditation", async () => {
    const payments = bankOrder().transactions.payments;
    mockBankReply(withPayments([payments[0], { ...payments[0], id: "PAY-DUPLICATE" }]));
    expect((await fetchMunicipalMpOrder(orderId, token)).accredited).toBe(false);
  });

  it("rejects an external order ID mismatch before treating the bank response as fetched", async () => {
    mockBankReply(bankOrder({ id: "DIFFERENT-ORDER" }));
    const observed = await fetchMunicipalMpOrder(orderId, token);
    expect(observed.fetched).toBe(false);
    expect(observed.accredited).not.toBe(true);
  });

  it("rejects pending, unpaid or mismatched credit values", async () => {
    for (const override of [
      { status: "action_required" },
      { total_paid_amount: "0.99" },
      { total_paid_amount: undefined },
      { currency: "USD" },
    ]) {
      mockBankReply(bankOrder(override));
      expect((await fetchMunicipalMpOrder(orderId, token)).accredited).toBe(false);
    }
  });

  it("rejects a refund or chargeback even if the original payment was credited", async () => {
    const transactions = bankOrder().transactions;
    mockBankReply(bankOrder({
      transactions: { ...transactions, refunds: [{ id: "refund-1" }] },
    }));
    expect((await fetchMunicipalMpOrder(orderId, token)).accredited).toBe(false);
    mockBankReply(bankOrder({
      transactions: { ...transactions, chargebacks: [{ id: "chargeback-1" }] },
    }));
    expect((await fetchMunicipalMpOrder(orderId, token)).accredited).toBe(false);
  });

  it("rejects provider unavailability without changing any guide", async () => {
    mockBankReply({ error: "provider_unavailable" }, 503);
    const observed = await fetchMunicipalMpOrder(orderId, token);
    expect(observed).toMatchObject({ fetched: false, status: "provider_http_503" });
    expect(observed.accredited).not.toBe(true);
  });
});
