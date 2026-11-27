import { beforeEach, describe, expect, it, vi } from "vitest";
import { callDataApiRpc, type ApiReq } from "./municipal-storage";
import { persistGuideCharge, readStoredGuide, storedGuideCharge, type StoredGuide } from "./guide-persistence";

vi.mock("./municipal-storage", () => ({ callDataApiRpc: vi.fn() }));

const line = "23793388096060157364540663333335168400000300000";
const barcode = "23791684000003000003388060601573644066333333";
const req = { headers: { authorization: "Bearer test" } } as ApiReq;
const guide: StoredGuide = {
  id: "g1", municipality_id: "m1", process_id: "p1", guide_number: "DAM-1",
  amount: 300, due_date: "2026-10-30", created_at: "2026-10-21T12:00:00Z", status: "pendente",
};

beforeEach(() => {
  vi.resetAllMocks();
  // Isolated QA-only fixture; never use or expose real webhook secrets.
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET", "ab".repeat(32));
});

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

  it("accepts exact decimal strings from Neon but rejects misrouted or fractional rows",async()=>{
    vi.mocked(callDataApiRpc).mockResolvedValue({ok:true,status:200,error:"",payload:{...guide,amount:"300.00"}});
    expect((await readStoredGuide(req,"m1","DAM-1")).amount).toBe(300);
    for(const patch of [{municipality_id:"other"},{guide_number:"DAM-2"},{process_id:""},{amount:"300.001"}]){
      vi.mocked(callDataApiRpc).mockResolvedValue({ok:true,status:200,error:"",payload:{...guide,...patch}});
      await expect(readStoredGuide(req,"m1","DAM-1")).rejects.toThrow("Guia inconsistente");
    }
  });
  it("rejects a persisted payment id or process that differs from the confirmed charge",async()=>{
    const charge={ok:true,environment:"test" as const,orderId:"order-1",paymentId:"pay-01",externalReference:"DAM-1",amount:"300.00"};
    const saved={...guide,bank_reference:"order-1",bank_payment_id:"pay-01",payment_provider:"mercado_pago",provider_environment:"test"};
    for(const patch of [{process_id:"other"},{amount:300.001},{bank_payment_id:"pay-other"}]){
      vi.mocked(callDataApiRpc).mockResolvedValue({ok:true,status:200,error:"",payload:{...saved,...patch}});
      await expect(persistGuideCharge(req,guide,charge)).rejects.toThrow("não confirmou");
    }
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
