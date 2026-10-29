import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { ApiReq } from "../../server/municipal-storage";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  authorize: vi.fn(),
  sync: vi.fn(),
  stored: vi.fn(),
}));
vi.mock("../../server/municipal-payment", () => ({
  resolveMercadoPagoMunicipalAccessToken: mocks.resolve,
}));
vi.mock("../../server/guide-persistence", () => ({
  readStoredGuide: mocks.read,
  assertGuideProviderWriteAccess: mocks.authorize,
  assertGuideProviderSyncAccess: mocks.sync,
  persistGuideCharge: mocks.write,
  storedGuideCharge: mocks.stored,
}));
import { createMercadoPagoGuideBoleto, getMercadoPagoGuideBoletoStatus } from "../../server/mercadopago";

const municipalityId = "11111111-1111-4111-8111-111111111111";
const original = {
  id: "22222222-2222-4222-8222-222222222222",
  municipality_id: municipalityId,
  process_id: "33333333-3333-4333-8333-333333333333",
  guide_number: "DAM-PRE-20261022-7791A2E9",
  amount: 35.24,
  due_date: "2026-10-24",
  created_at: "2026-10-22T14:21:24.884Z",
  status: "pendente",
  payment_provider: "mercado_pago",
  provider_environment: "test",
  collection_mode_snapshot: "sigapro",
};
const barcode = "23791684000003000003388060601573644066333333";
const digitable = "23793388096060157364540663333335168400000300000";
const req = { headers: { authorization: "Bearer isolated-qa-session" } } as ApiReq;
const input = { municipalityId, guideCode: original.guide_number, amount: 999 };
const opts = { isolatedSandboxOnly: true };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SIGAPRO_LOCAL_QA_LAUNCH", "true");
  vi.stubEnv("SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES", "true");
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
  mocks.resolve.mockResolvedValue({ environment: "test", token: "APP_USR_TEST_STUB" });
  mocks.read.mockResolvedValue(original);
  mocks.authorize.mockResolvedValue(undefined);
  mocks.write.mockImplementation(async (_req, _stored, charge) => ({ ...charge,ok:true }));
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({
    id: "MP-ORDER-SANDBOX",
    external_reference: original.guide_number,
    total_amount: "35.24",
    status: "action_required",
    transactions: { payments: [{
      id: "MP-PAYMENT-SANDBOX",
      status: "action_required",
      status_detail: "waiting_payment",
      payment_method: {
        barcode_content: barcode,
        digitable_line: digitable,
        financial_institution: "Banco de testes",
      },
    }] },
  }), {status:201})));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("one complete sandbox-only SIGAPRO bank issuance", () => {
  it("issues once with canonical Neon guide amount, saves a real provider order and returns official barcode", async () => {
    const result = await createMercadoPagoGuideBoleto(input, req, opts);
    expect(result.ok).toBe(true);
    expect(result.environment).toBe("test");
    expect(result.digitableLine).toBe(digitable);
    expect(result.barcodeContent).toBe(barcode);
    expect(result.orderId).toBe("MP-ORDER-SANDBOX");
    expect(mocks.authorize).toHaveBeenCalledWith(req, original, true);
    expect(mocks.write).toHaveBeenCalledWith(req, original, expect.objectContaining({
      orderId: "MP-ORDER-SANDBOX", externalReference: original.guide_number, amount: "35.24",
    }), true);
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.mercadopago.com/v1/orders");
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body)).total_amount).toBe("35.24");
    expect(JSON.parse(String(request?.body)).payer.email).toBe("test@testuser.com");
    expect(mocks.resolve).toHaveBeenCalledWith(req, municipalityId);
  });

  it("reports provider acceptance and Neon persistence failure accurately without changing the idempotency key", async () => {
    mocks.write.mockRejectedValueOnce(new Error('column reference "barcode" is ambiguous'));
    const failed = await createMercadoPagoGuideBoleto(input, req, opts);
    expect(failed.ok).toBe(false);
    expect(failed.errorCode).toBe("PROVIDER_ACCEPTED_PERSISTENCE_OR_SYNC_FAILED");
    expect(failed.error).toContain("Neon");
    expect(failed.error).not.toContain("Falha de rede ao criar");
    const first = vi.mocked(fetch).mock.calls[0];
    expect(first[1]?.method).toBe("POST");
    const stableKey = (first[1]?.headers as Record<string,string>)["X-Idempotency-Key"];
    expect(stableKey).toMatch(/^[0-9a-f-]{36}$/);
    const recovered = await createMercadoPagoGuideBoleto(input, req, opts);
    expect(recovered.ok).toBe(true);
    const second = vi.mocked(fetch).mock.calls[1];
    expect((second[1]?.headers as Record<string,string>)["X-Idempotency-Key"]).toBe(stableKey);
    expect(JSON.parse(String(second[1]?.body)).total_amount).toBe("35.24");
  });

  it("rejects a production environment BEFORE any provider or guide access", async () => {
    mocks.resolve.mockResolvedValue({ environment:"production", token: "APP_USR_PROD" });
    await expect(createMercadoPagoGuideBoleto(input, req, opts)).rejects.toThrow(/Conta de produção bloqueada/);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts an explicitly opted-in Vercel QA branch and issues ONLY with TEST token",async()=>{
    vi.stubEnv("SIGAPRO_LOCAL_QA_LAUNCH","false");
    vi.stubEnv("SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES","false");
    vi.stubEnv("VERCEL_ENV","preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","qa/sigapro-ia-logo-integrado-20261023");
    vi.stubEnv("SIGAPRO_QA_MP_SETUP_OPT_IN","QA_ONLY_TEST_CREDENTIALS");
    vi.stubEnv("SIGAPRO_QA_MP_CHARGE_OPT_IN","QA_ONLY_TEST_ORDERS");
    vi.stubEnv("MUNICIPAL_PAYMENT_MASTER_KEY","A".repeat(32));
    vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","a".repeat(64));
    const result=await createMercadoPagoGuideBoleto(input,req,opts);
    expect(result.ok).toBe(true);
    expect(result.environment).toBe("test");
    expect(mocks.authorize).toHaveBeenCalledWith(req,original,true);
    expect(mocks.write).toHaveBeenCalledWith(req,original,expect.anything(),true);
  });
  it.each([
    ["production deploy","production","qa/sigapro-ia-logo-integrado-20261023","QA_ONLY_TEST_ORDERS"],
    ["wrong branch","preview","main","QA_ONLY_TEST_ORDERS"],
    ["missing explicit charge opt-in","preview","qa/sigapro-ia-logo-integrado-20261023",""],
  ])("blocks remote boleto from %s before provider call",async(_name,env,ref,opt)=>{
    vi.stubEnv("SIGAPRO_LOCAL_QA_LAUNCH","false");
    vi.stubEnv("SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES","false");
    vi.stubEnv("VERCEL_ENV",env);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF",ref);
    vi.stubEnv("SIGAPRO_QA_MP_SETUP_OPT_IN","QA_ONLY_TEST_CREDENTIALS");
    vi.stubEnv("SIGAPRO_QA_MP_CHARGE_OPT_IN",opt);
    vi.stubEnv("MUNICIPAL_PAYMENT_MASTER_KEY","A".repeat(32));
    vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","a".repeat(64));
    await expect(createMercadoPagoGuideBoleto(input,req,opts)).rejects.toThrow("preview");
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks production payment credentials even on isolated QA preview",async()=>{
    vi.stubEnv("SIGAPRO_LOCAL_QA_LAUNCH","false");
    vi.stubEnv("SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES","false");
    vi.stubEnv("VERCEL_ENV","preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","qa/sigapro-ia-logo-integrado-20261023");
    vi.stubEnv("SIGAPRO_QA_MP_SETUP_OPT_IN","QA_ONLY_TEST_CREDENTIALS");
    vi.stubEnv("SIGAPRO_QA_MP_CHARGE_OPT_IN","QA_ONLY_TEST_ORDERS");
    vi.stubEnv("MUNICIPAL_PAYMENT_MASTER_KEY","A".repeat(32));
    vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","a".repeat(64));
    mocks.resolve.mockResolvedValue({environment:"production",token:"APP_USR_PROD"});
    await expect(createMercadoPagoGuideBoleto(input,req,opts)).rejects.toThrow("Conta de produção bloqueada");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects any nonisolated launch before touching bank accounts", async () => {
    vi.stubEnv("SIGAPRO_LOCAL_QA_LAUNCH", "false");
    await expect(createMercadoPagoGuideBoleto(input, req, opts)).rejects.toThrow(/localhost QA ou preview/);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a missing guide without creating any order", async () => {
    mocks.read.mockRejectedValue(new Error("Guia não encontrada ou acesso não autorizado"));
    await expect(createMercadoPagoGuideBoleto(input, req, opts)).rejects.toThrow("Guia não encontrada");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { paid: true, status: "pendente" },
    { paid: false, status: "pago" },
    { paid: false, status: "confirmed" },
    { paid: false, status: "compensada" },
  ])("never issues a bank order for an already-paid guide (%s)", async (state) => {
    mocks.read.mockResolvedValue({ ...original, ...state });
    mocks.stored.mockReturnValue({ ok: false, environment: "test" });
    const result = await createMercadoPagoGuideBoleto(input, req, opts);
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("never synchronizes a paid guide through the bank provider, including a stale pending status", async () => {
    mocks.read.mockResolvedValue({ ...original, paid: true, status: "pendente", bank_reference: "OLD-ORDER" });
    mocks.stored.mockReturnValue({ ok: false, environment: "test" });
    await getMercadoPagoGuideBoletoStatus({
      municipalityId, guideCode: original.guide_number, orderId: "OLD-ORDER", amount: original.amount,
    }, req, opts);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("never calls a bank provider for a guide owned by municipal collection", async () => {
    mocks.read.mockResolvedValue({ ...original, collection_mode_snapshot: "municipal_system", bank_reference: "LEGACY-ORDER" });
    await expect(createMercadoPagoGuideBoleto(input, req, opts)).rejects.toThrow(/arrecadação própria/);
    await expect(getMercadoPagoGuideBoletoStatus({
      municipalityId, guideCode: original.guide_number, orderId: "LEGACY-ORDER", amount: original.amount,
    }, req, opts)).rejects.toThrow(/arrecadação própria/);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("does not create a second charge when an order reference already exists", async () => {
    mocks.read.mockResolvedValue({...original,bank_reference:"MP-ORDER-SANDBOX"});
    mocks.sync.mockResolvedValue(undefined);
    mocks.write.mockImplementation(async (_req,_guide,charge)=>({...charge,ok:true}));
    const result=await createMercadoPagoGuideBoleto(input,req,opts);
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("GET");
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});

describe("Mercado Pago provider identity guards before Neon persistence", () => {
  it("rejects a GET returning another order ID, even with matching value and guide", async () => {
    mocks.read.mockResolvedValue({ ...original, bank_reference: "MP-ORDER-SANDBOX" });
    mocks.sync.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "UNRELATED-ORDER",
      external_reference: original.guide_number,
      total_amount: "35.24",
      transactions: { payments: [{ id: "P1", payment_method: {
        barcode_content: barcode, digitable_line: digitable,
      } }] },
    }), { status: 200 })));
    const result = await getMercadoPagoGuideBoletoStatus({
      municipalityId, guideCode: original.guide_number,
      orderId: "MP-ORDER-SANDBOX", amount: original.amount,
    }, req, opts);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ordem diferente/);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rejects two payment transactions for one bank guide, without updating Neon", async () => {
    mocks.read.mockResolvedValue({ ...original, bank_reference: "MP-ORDER-SANDBOX" });
    mocks.sync.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "MP-ORDER-SANDBOX",
      external_reference: original.guide_number,
      total_amount: "35.24",
      status: "processed", status_detail: "accredited",
      transactions: { payments: [
        { id: "P1", amount: "35.24", payment_method: { barcode_content: barcode, digitable_line: digitable } },
        { id: "P2", amount: "35.24", payment_method: { barcode_content: barcode, digitable_line: digitable } },
      ] },
    }), { status: 200 })));
    const result = await getMercadoPagoGuideBoletoStatus({
      municipalityId, guideCode: original.guide_number,
      orderId: "MP-ORDER-SANDBOX", amount: original.amount,
    }, req, opts);
    expect(result.ok).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rejects a provider payment amount different from the canonical guide", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "MP-ORDER-SANDBOX",
      external_reference: original.guide_number,
      total_amount: "35.24",
      transactions: { payments: [{
        id: "P1", amount: "1.00",
        payment_method: { barcode_content: barcode, digitable_line: digitable },
      }] },
    }), { status: 201 })));
    const result = await createMercadoPagoGuideBoleto(input, req, opts);
    expect(result.ok).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
