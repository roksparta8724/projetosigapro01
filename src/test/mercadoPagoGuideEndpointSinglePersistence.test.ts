import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  createBoleto: vi.fn(),
  getBoletoStatus: vi.fn(),
  callDataApiRpc: vi.fn(),
}));
vi.mock("../../server/mercadopago.js", () => ({
  createMercadoPagoGuideBoleto: mocks.createBoleto,
  getMercadoPagoGuideBoletoStatus: mocks.getBoletoStatus,
  checkMercadoPagoConnection: vi.fn(),
}));
vi.mock("../../server/municipal-storage.js", () => ({
  callDataApiRpc: mocks.callDataApiRpc,
}));

import handler from "../../api/mercadopago";

type Reply = { statusCode: number; json: Record<string, unknown> };
function invoke(action: "guide-boleto" | "guide-status") {
  const response: Reply = { statusCode: 0, json: {} };
  const req = {
    method: "POST",
    url: "/api/mercadopago?action=" + action,
    body: {
      municipalityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      guideCode: "DAM-001",
      orderId: "sandbox-order-123",
      amount: 100,
    },
  };
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn((raw: string) => {
      response.statusCode = res.statusCode;
      response.json = JSON.parse(raw) as Record<string, unknown>;
    }),
  };
  return handler(req as never, res as never).then(() => response);
}
describe("SIGAPRO — não persistir duas vezes o retorno bancário", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "false");
    mocks.createBoleto.mockReset();
    mocks.getBoletoStatus.mockReset();
    mocks.callDataApiRpc.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("emissão devolve o recibo já persistido sem RPC legado por número de guia", async () => {
    mocks.createBoleto.mockResolvedValue({
      ok: true, environment: "test", orderId: "sandbox-order-123",
      barcodeContent: "1".repeat(44), digitableLine: "2".repeat(47),
    });
    const result = await invoke("guide-boleto");
    expect(result.statusCode).toBe(201);
    expect(result.json.ok).toBe(true);
    expect(mocks.createBoleto).toHaveBeenCalledTimes(1);
    expect(mocks.createBoleto).toHaveBeenCalledWith(
      expect.objectContaining({ municipalityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", guideCode: "DAM-001" }),
      expect.anything(),
      undefined, // production path does not inherit QA-only persistence permissions
    );
    expect(mocks.callDataApiRpc).not.toHaveBeenCalled();
  });

  it("consulta de situação não chama o RPC v1 após o fluxo financeiro validado", async () => {
    mocks.getBoletoStatus.mockResolvedValue({
      ok: true, environment: "test", status: "processed",
      orderId: "sandbox-order-123",
    });
    const result = await invoke("guide-status");
    expect(result.statusCode).toBe(200);
    expect(result.json.status).toBe("processed");
    expect(mocks.getBoletoStatus).toHaveBeenCalledTimes(1);
    expect(mocks.callDataApiRpc).not.toHaveBeenCalled();
  });

  it("o contrato do servidor persiste exclusivamente pelo RPC v2 com município e guia", () => {
    const provider = readFileSync("server/guide-persistence.ts", "utf8");
    const endpoint = readFileSync("api/mercadopago.ts", "utf8");
    expect(provider).toContain('"persist_payment_guide_provider_charge_v2"');
    expect(provider).toContain("_municipality_id: guide.municipality_id");
    expect(provider).toContain("persisted.id !== guide.id");
    expect(endpoint).not.toContain('rpcOrThrow(req, "persist_payment_guide_provider_charge_v1"');
  });
});
