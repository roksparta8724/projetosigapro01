import { beforeEach, describe, expect, it, vi } from "vitest";
import { callDataApiRpc, type ApiReq } from "./municipal-storage";
import { persistGuideCharge, storedGuideCharge, type StoredGuide } from "./guide-persistence";

vi.mock("./municipal-storage", () => ({ callDataApiRpc: vi.fn() }));

const line = "23793388096060157364540663333335168400000300000";
const barcode = "23791684000003000003388060601573644066333333";
const req = { headers: { authorization: "Bearer test" } } as ApiReq;
const guide: StoredGuide = {
  id: "g1", municipality_id: "m1", process_id: "p1", guide_number: "DAM-1",
  amount: 300, due_date: "2026-10-30", created_at: "2026-10-21T12:00:00Z", status: "pendente",
};

beforeEach(() => vi.resetAllMocks());

describe("confirmed guide provider persistence", () => {
  it("never reports success for missing or inconsistent stored banking data", () => {
    expect(storedGuideCharge({ ...guide, bank_reference: "order-1" }).ok).toBe(false);
    expect(storedGuideCharge({ ...guide, bank_reference: "order-1", barcode: "1".repeat(44), digitable_line: line }).ok).toBe(false);
  });

  it("returns only canonical values confirmed by Neon", async () => {
    vi.mocked(callDataApiRpc).mockResolvedValue({
      ok: true, status: 200, error: "",
      payload: { ...guide, bank_reference: "order-1", barcode, digitable_line: line, payment_provider: "mercado_pago", provider_environment: "test" },
    });
    const result = await persistGuideCharge(req, guide, {
      ok: true, environment: "test", orderId: "order-1", externalReference: "DAM-1",
      amount: "300.00", barcodeContent: barcode, digitableLine: line,
    });
    expect(result).toMatchObject({ ok: true, orderId: "order-1", barcodeContent: barcode, digitableLine: line });
  });

  it("fails when Neon does not confirm the guide reference", async () => {
    vi.mocked(callDataApiRpc).mockResolvedValue({
      ok: true, status: 200, error: "", payload: { ...guide, bank_reference: "other" },
    });
    await expect(persistGuideCharge(req, guide, {
      ok: true, environment: "test", orderId: "order-1", externalReference: "DAM-1", amount: "300.00",
    })).rejects.toThrow("não confirmou");
  });
});
