import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMercadoPagoGuideBoleto, getMercadoPagoGuideBoletoStatus } from "../../server/mercadopago";
import { callDataApiRpc } from "../../server/municipal-storage";
import type { ApiReq } from "../../server/municipal-storage";

vi.mock("../../server/municipal-storage", () => ({ callDataApiRpc: vi.fn() }));
vi.mock("../../server/municipal-payment", () => ({ resolveMercadoPagoMunicipalAccessToken: vi.fn(async () => ({ environment: "test", token: "sandbox" })) }));
const req = { headers: { authorization: "Bearer fake-test" } } as ApiReq;
const guide = { id: "g1", municipality_id: "m1", process_id: "p1", guide_number: "DAM-001", amount: 300, due_date: "2026-10-20", created_at: "2026-10-13T12:00:00Z", status: "pendente" };
const input = { municipalityId: "m1", guideCode: "DAM-001", amount: 999 };
const rpc = vi.mocked(callDataApiRpc);
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network"); })); });

describe("Neon guide charge persistence", () => {
  it("checks write authorization before contacting the provider", async () => {
    rpc.mockResolvedValueOnce({ ok: true, status: 200, payload: guide, error: "" })
      .mockResolvedValueOnce({ ok: false, status: 403, payload: null, error: "read only" });
    await expect(createMercadoPagoGuideBoleto(input, req)).rejects.toThrow("read only");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never calls the provider or writes when the stored guide is paid, even with stale UI", async () => {
    rpc.mockResolvedValue({ ok: true, status: 200, payload: { ...guide, status: "compensada" }, error: "" });
    expect((await createMercadoPagoGuideBoleto(input, req)).amount).toBe("300.00");
    await getMercadoPagoGuideBoletoStatus({ ...input, orderId: "old" }, req);
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc.mock.calls.every((call) => call[1] === "get_payment_guide_original_v1")).toBe(true);
  });
  it("refuses a missing/unauthorized guide before provider access", async () => {
    rpc.mockResolvedValue({ ok: false, status: 403, payload: null, error: "denied" });
    await expect(createMercadoPagoGuideBoleto(input, req)).rejects.toThrow("denied");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses querying an order from another guide", async () => {
    rpc.mockResolvedValue({ ok: true, status: 200, payload: { ...guide, bank_reference: "correct" }, error: "" });
    await expect(getMercadoPagoGuideBoletoStatus({ ...input, orderId: "other" }, req)).rejects.toThrow("não vinculada");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("persists an incomplete provider order and uses the canonical amount", async () => {
    rpc.mockResolvedValueOnce({ ok: true, status: 200, payload: guide, error: "" })
      .mockResolvedValueOnce({ ok: true, status: 200, payload: true, error: "" })
      .mockResolvedValue({ ok: true, status: 200, payload: { ...guide, bank_reference: "order1", payment_provider: "mercado_pago", provider_environment: "test" }, error: "" });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "order1", external_reference: "DAM-001", total_amount: "300.00" }), { status: 200 }));
    const result = await createMercadoPagoGuideBoleto(input, req);
    expect(result.ok).toBe(false);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).total_amount).toBe("300.00");
    expect(rpc).toHaveBeenCalledWith(req, "persist_payment_guide_provider_charge_v2", expect.objectContaining({ _municipality_id: "m1", _charge: expect.objectContaining({ orderId: "order1" }) }));
  });
  it("reports persistence failure instead of returning a locally successful charge", async () => {
    rpc.mockResolvedValueOnce({ ok: true, status: 200, payload: guide, error: "" })
      .mockResolvedValueOnce({ ok: true, status: 200, payload: true, error: "" })
      .mockResolvedValue({ ok: false, status: 503, payload: null, error: "offline" });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "order1", external_reference: "DAM-001", total_amount: "300.00" }), { status: 200 }));
    expect((await createMercadoPagoGuideBoleto(input, req)).error).toContain("salvar dados bancários");
  });
  it("updates an existing reference without authorizing a second charge", async () => {
    const stored = { ...guide, bank_reference: "order1" };
    rpc.mockResolvedValueOnce({ ok: true, status: 200, payload: stored, error: "" })
      .mockResolvedValueOnce({ ok: true, status: 200, payload: stored, error: "" })
      .mockResolvedValueOnce({ ok: true, status: 200, payload: true, error: "" })
      .mockResolvedValueOnce({ ok: true, status: 200, payload: { ...stored, payment_provider: "mercado_pago", provider_environment: "test", barcode: "23791684000003000003388060601573644066333333", digitable_line: "23793388096060157364540663333335168400000300000" }, error: "" });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      id: "order1", external_reference: "DAM-001", total_amount: "300.00",
      transactions: { payments: [{ payment_method: { barcode_content: "23791684000003000003388060601573644066333333", digitable_line: "23793388096060157364540663333335168400000300000" } }] },
    }), { status: 200 }));
    expect((await createMercadoPagoGuideBoleto(input, req)).ok).toBe(true);
    expect(rpc.mock.calls.some((call) => call[1] === "authorize_payment_guide_charge_v1")).toBe(false);
    expect(rpc.mock.calls.some((call) => call[1] === "authorize_payment_guide_provider_sync_v1")).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("GET");
  });
});
