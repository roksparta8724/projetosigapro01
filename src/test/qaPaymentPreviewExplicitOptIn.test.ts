import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), status: vi.fn(), boleto: vi.fn(), health: vi.fn(),
  getAdmin: vi.fn(), getGuide: vi.fn(), resolveToken: vi.fn(),
}));
vi.mock("../../server/municipal-storage.js", () => ({ callDataApiRpc: mocks.rpc }));
vi.mock("../../server/guide-persistence.js", () => ({ readStoredGuide: mocks.getGuide }));
vi.mock("../../server/mercadopago.js", () => ({
  checkMercadoPagoConnection: mocks.health,
  createMercadoPagoGuideBoleto: mocks.boleto,
  getMercadoPagoGuideBoletoStatus: mocks.status,
}));
vi.mock("../../server/municipal-payment.js", () => ({
  getMunicipalPaymentSecretAdmin: mocks.getAdmin,
  resolveMercadoPagoMunicipalAccessToken: mocks.resolveToken,
  encryptPaymentAccessToken: vi.fn(), encryptPaymentWebhookSecret: vi.fn(),
  decryptPaymentAccessToken: vi.fn(), paymentCredentialFingerprint: vi.fn(),
  paymentWebhookFingerprint: vi.fn(), testMercadoPagoToken: vi.fn(),
}));
import handler from "../../api/mercadopago";

function invoke(action: string, payload: Record<string, unknown> = {}, bearer = "") {
  let response: Record<string, unknown> = {};
  const req = {
    method: action === "health" ? "GET" : "POST",
    url: "/api/mercadopago?action=" + action,
    headers: bearer ? { authorization: bearer } : {},
    body: { municipalityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", guideCode: "QA-TEST-GUIDE", ...payload },
  };
  const res = {
    statusCode: 200, setHeader: vi.fn(),
    end: vi.fn((raw: string) => { response = { status: res.statusCode, ...JSON.parse(raw) }; }),
  };
  return handler(req as never, res as never).then(() => response);
}
const branch = "qa/sigapro-ia-logo-integrado-20261023";
function enableQaSetup() {
  vi.stubEnv("SIGAPRO_QA_MP_SETUP_OPT_IN", "QA_ONLY_TEST_CREDENTIALS");
  vi.stubEnv("MUNICIPAL_PAYMENT_MASTER_KEY", "isolated-qa-encryption-key-longer-than-32");
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET", "c".repeat(64));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", branch);
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
  vi.stubEnv("SIGAPRO_QA_MP_CHARGE_OPT_IN", "");
  vi.stubEnv("SIGAPRO_QA_MP_SETUP_OPT_IN", "");
  vi.stubEnv("MUNICIPAL_PAYMENT_MASTER_KEY", "");
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("Mercado Pago: preview municipal isolated bank gate", () => {
  it("remains closed until branch-specific setup and secrets are configured", async () => {
    const r = await invoke("health");
    expect(r.status).toBe(503);
    expect(r.code).toBe("QA_PAYMENT_PROVIDER_DISABLED");
    expect(mocks.health).not.toHaveBeenCalled();
  });
  it("rejects setup when run from any other preview branch", async () => {
    enableQaSetup();
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/other-prefeitura");
    expect((await invoke("health")).code).toBe("QA_PAYMENT_PROVIDER_DISABLED");
  });
  it("reports QA setup available without asserting a bank account was verified", async () => {
    enableQaSetup();
    const r = await invoke("health");
    expect(r.status).toBe(200);
    expect(r.code).toBe("QA_TEST_CREDENTIAL_SETUP_AVAILABLE");
    expect(r.testAccountVerified).toBe(false);
    expect(r.orderCreationEnabled).toBe(false);
    expect(mocks.health).not.toHaveBeenCalled();
  });
  it("never accepts production-mode credentials in isolated QA", async () => {
    enableQaSetup();
    const r = await invoke("payment-connection", { action: "save", provider: "mercado_pago", environment: "production" });
    expect(r.code).toBe("QA_TEST_CREDENTIALS_ONLY");
    expect(r.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("blocks new orders even when QA credential setup is available", async () => {
    enableQaSetup();
    const r = await invoke("guide-boleto");
    expect(r.status).toBe(503);
    expect(r.code).toBe("QA_PAYMENT_CHARGES_DISABLED");
    expect(mocks.getGuide).not.toHaveBeenCalled();
    expect(mocks.boleto).not.toHaveBeenCalled();
  });
  it("needs a JWT even when the separate test-order opt-in is set", async () => {
    enableQaSetup();
    vi.stubEnv("SIGAPRO_QA_MP_CHARGE_OPT_IN", "QA_ONLY_TEST_ORDERS");
    const r = await invoke("guide-boleto");
    expect(r.status).toBe(401);
    expect(r.code).toBe("QA_AUTH_REQUIRED");
    expect(mocks.boleto).not.toHaveBeenCalled();
  });
  it("refuses a provider connection pointing at production before any charge", async () => {
    enableQaSetup();
    vi.stubEnv("SIGAPRO_QA_MP_CHARGE_OPT_IN", "QA_ONLY_TEST_ORDERS");
    mocks.getGuide.mockResolvedValue({ id: "guide1", municipality_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    mocks.resolveToken.mockResolvedValue({ environment: "production", token: "unused" });
    const r = await invoke("guide-boleto", {}, "Bearer synthetic-qa-token");
    expect(r.status).toBe(403);
    expect(r.code).toBe("QA_TEST_CREDENTIALS_ONLY");
    expect(mocks.boleto).not.toHaveBeenCalled();
  });
  it("keeps guide status reads disabled until the bank test-order opt-in", async () => {
    enableQaSetup();
    const r = await invoke("guide-status", {}, "Bearer synthetic-qa-token");
    expect(r.status).toBe(503);
    expect(mocks.status).not.toHaveBeenCalled();
  });
});
