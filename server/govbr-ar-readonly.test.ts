import { afterEach, describe, expect, it, vi } from "vitest";
import { govbrArReadOnlyAdapter, govbrArReadSettings, govbrArResponseShape } from "./govbr-ar-readonly";
import type { MunicipalCollectionAdapterContext } from "./municipal-collection-adapters";

const context: MunicipalCollectionAdapterContext = {
  municipalityId: "11111111-1111-4111-8111-111111111111",
  environment: "test",
  baseUrl: "https://receitas.govbr.cloud/",
  secret: "api-secret-from-vault",
  parameters: { govbrAr: { authMode: "bearer", readPath: "/api/consulta" } },
};
afterEach(() => { vi.unstubAllGlobals(); });

describe("GOVBR/AR — municipal strictly read-only onboarding", () => {
  it("has only GET/query; no guide issue, PDF or settlement capability", async () => {
    expect(govbrArReadOnlyAdapter.operations).toEqual(["query"]);
    await expect(govbrArReadOnlyAdapter.execute("payment", context, {})).rejects.toThrow(/somente leitura/);
    await expect(govbrArReadOnlyAdapter.execute("issue", context, {})).rejects.toThrow(/somente leitura/);
    await expect(govbrArReadOnlyAdapter.execute("query", context, { processId: "outside" })).rejects.toThrow(/somente leitura/);
  });
  it("rejects unapproved host, private address, wrong scheme and untrusted path", () => {
    for (const baseUrl of [
      "http://receitas.govbr.cloud/", "https://govbr.cloud.evil.com/",
      "https://127.0.0.1/", "https://192.168.1.20/",
      "https://receitas.govbr.cloud@evil.com/",
      "https://receitas.govbr.cloud:8443/",
      "https://receitas.govbr.cloud/?token=leak",
    ]) expect(() => govbrArReadSettings({ ...context, baseUrl })).toThrow();
    for (const readPath of [
      "//evil.com", "/../secrets", "/a?token=key", "https://evil.com/route",
      "/a#invalid", "/",
    ]) expect(() => govbrArReadSettings({
      ...context, parameters: { govbrAr: { readPath, authMode: "bearer" } },
    })).toThrow();
    expect(() => govbrArReadSettings({
      ...context, municipalityId: "11111111-1111-4111-8111-111111111112",
    })).not.toThrow();
    expect(() => govbrArReadSettings({ ...context, secret: "" })).toThrow();
  });
  it("performs only the authorized GET and returns shape, not taxpayer data", async () => {
    const fetchMock = vi.fn(async (_url: URL, options: RequestInit) => {
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("manual");
      expect((options.headers as Record<string, string>).Authorization).toBe("Bearer api-secret-from-vault");
      return new Response(JSON.stringify({
        dados: [{ nome: "NOME SIGILOSO", cpf: "12345678909", valor: "99.50" }],
        total: 1,
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await govbrArReadOnlyAdapter.execute("query", context, {});
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true, supplierCode: "govbr_ar", method: "GET", readOnly: true,
      automaticSettlementAvailable: false, chargeIssuanceAvailable: false,
      pdfAvailable: false, kind: "object",
      arrays: [{ field: "dados", recordCount: 1 }], exampleValuesExposed: false,
    });
    expect(JSON.stringify(result)).not.toContain("NOME SIGILOSO");
    expect(JSON.stringify(result)).not.toContain("12345678909");
    expect(JSON.stringify(result)).not.toContain("99.50");
  });
  it("supports key header but never forwards credentials after redirect", async () => {
    const fetchMock = vi.fn(async (_url: URL, options: RequestInit) => {
      expect((options.headers as Record<string, string>)["X-Api-Key"]).toBe("api-secret-from-vault");
      return new Response(null, { status: 302, headers: { location: "https://evil.com" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(govbrArReadOnlyAdapter.execute("query", {
      ...context, parameters: { govbrAr: { authMode: "x-api-key", readPath: "/api/consulta" } },
    }, {})).rejects.toThrow(/redirecionou/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("fails closed for missing/oversized/non-JSON responses", async () => {
    for (const response of [
      new Response("erro", { status: 403, headers: { "content-type": "text/plain" } }),
      new Response("<html/>", { status: 200, headers: { "content-type": "text/html" } }),
      new Response("{", { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ items: [] }), {
        status: 200, headers: { "content-type": "application/json", "content-length": "900000" },
      }),
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => response));
      await expect(govbrArReadOnlyAdapter.execute("query", context, {})).rejects.toThrow();
    }
  });
  it("normalizes arrays without leaking field values", () => {
    const result = govbrArResponseShape([{ documento: "123", valor: 180 }]);
    expect(result).toMatchObject({ kind: "array", recordCount: 1, fields: ["documento", "valor"], exampleValuesExposed: false });
    expect(JSON.stringify(result)).not.toContain("123");
  });
});
