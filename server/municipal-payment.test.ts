import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("./municipal-storage", () => ({
  callDataApiRpc: rpcMock,
  // A machine-wide token deliberately exists: municipal calls must NEVER use it.
  readEnv: (key: string) => key === "MUNICIPAL_PAYMENT_MASTER_KEY"
    ? "isolated-test-master-key"
    : "GLOBAL_TOKEN_MUST_NOT_BE_USED",
}));

import {
  encryptPaymentAccessToken,
  resolveMercadoPagoMunicipalAccessToken,
} from "./municipal-payment";
import { checkMercadoPagoConnection } from "./mercadopago";
import type { ApiReq } from "./municipal-storage";

const tenant = "11111111-1111-4111-8111-111111111111";
const anotherTenant = "22222222-2222-4222-8222-222222222222";
const req = { headers: { authorization: "Bearer isolated-session" } } as ApiReq;

beforeEach(() => { rpcMock.mockReset(); });

describe("municipal payment isolation — fail closed", () => {
  it("does not use an environment token when the municipality is missing", async () => {
    await expect(resolveMercadoPagoMunicipalAccessToken(req, undefined))
      .rejects.toThrow("Identificação da Prefeitura obrigatória");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("blocks an inactive or missing municipality provider", async () => {
    rpcMock.mockResolvedValue({
      ok: true, payload: { municipality_id: tenant, provider: "manual", status: "inactive" },
    });
    await expect(resolveMercadoPagoMunicipalAccessToken(req, tenant))
      .rejects.toThrow("Mercado Pago não está ativo");
    expect(rpcMock).toHaveBeenCalledWith(
      req, "resolve_municipal_payment_secret_v1", { _municipality_id: tenant },
    );
  });

  it("does not silently use global credentials on a Neon schema failure", async () => {
    rpcMock.mockResolvedValue({ ok: false, error: "PGRST202: function not found" });
    await expect(resolveMercadoPagoMunicipalAccessToken(req, tenant))
      .rejects.toThrow("PGRST202");
  });

  it("rejects credentials returned for the wrong municipality", async () => {
    rpcMock.mockResolvedValue({
      ok: true,
      payload: {
        municipality_id: anotherTenant,
        provider: "mercado_pago",
        status: "active",
        environment: "test",
        credentials_ciphertext: encryptPaymentAccessToken("TENANT_TOKEN"),
      },
    });
    await expect(resolveMercadoPagoMunicipalAccessToken(req, tenant))
      .rejects.toThrow("não pertence à Prefeitura");
  });

  it("uses ONLY the active, encrypted credential of the correct municipality", async () => {
    rpcMock.mockResolvedValue({
      ok: true,
      payload: {
        municipality_id: tenant,
        provider: "mercado_pago",
        status: "active",
        environment: "test",
        credentials_ciphertext: encryptPaymentAccessToken("TENANT_TOKEN"),
      },
    });
    const result = await resolveMercadoPagoMunicipalAccessToken(req, tenant);
    expect(result.token).toBe("TENANT_TOKEN");
    expect(result.source).toBe("municipality");
    expect(result.environment).toBe("test");
  });

  it("reports missing municipal credentials via health without global fallback", async () => {
    rpcMock.mockResolvedValue({ ok: true, payload: { provider: "manual", status: "inactive" } });
    const result = await checkMercadoPagoConnection(req, tenant);
    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
    expect(result.error).toMatch(/não está ativo/i);
  });
});
