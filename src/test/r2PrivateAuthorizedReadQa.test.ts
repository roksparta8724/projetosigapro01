import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizePrivateR2DocumentRead } from "../../server/api/r2-sign-get";
import { callDataApiRpc } from "../../server/municipal-storage";

vi.mock("../../server/municipal-storage", () => ({
  getDataApiUrl: () => "https://db-test.invalid",
  readBearer: () => "test-bearer",
  resolveMunicipalDocumentTarget: vi.fn(),
  callDataApiRpc: vi.fn(async () => ({ ok: true, payload: true })),
}));

const city = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const other = "14dac0b6-6352-4744-9aab-9ff91c59d970";
const processId = "1244ccaa-1111-4111-8111-123456abcdef";
const id = "2244ccaa-1111-4111-8111-123456abcdef";
const key = "municipalities/" + city + "/processes/" + processId + "/project.pdf";
const row = {
  id, process_id: processId, tenant_id: city, municipality_id: city,
  file_path: key, version: 3, is_valid: true, invalidated_at: null,
};

const request = { headers: { authorization: "Bearer test-bearer" } } as Parameters<typeof authorizePrivateR2DocumentRead>[0];
const select = (value: unknown, status=200) => vi.stubGlobal("fetch", vi.fn(async () => ({
  ok: status === 200, status, json: async () => value,
})));

describe("SIGAPRO QA — assinatura R2 privada usa SELECT real e RPC após validar estado", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => vi.unstubAllGlobals());

  it("recusa versão inválida, duplicada ou estrangeira SEM invocar RPC de liberação", async () => {
    for (const value of [
      [{ ...row, is_valid: false }],
      [{ ...row, invalidated_at: "2026-11-07T11:00:00Z" }],
      [{ ...row, tenant_id: other }],
      [{ ...row, municipality_id: other }],
      [{ ...row, file_path: key + ".old" }],
      [row, row],
      [],
    ]) {
      vi.mocked(callDataApiRpc).mockClear();
      select(value);
      const allowed = await authorizePrivateR2DocumentRead(request, key, city);
      expect(allowed).toMatchObject({ok:false, status:403});
      expect(callDataApiRpc).not.toHaveBeenCalled();
    }
  });

  it("só libera arquivo vigente com sucesso também na RPC do mesmo documento", async () => {
    select([row]);
    const result = await authorizePrivateR2DocumentRead(request, key, city);
    expect(result).toEqual({ok:true});
    expect(callDataApiRpc).toHaveBeenCalledWith(
      request, "authorize_technical_document_signing_v1", {_document_id:id},
    );
    const fetchMock = vi.mocked(fetch);
    const params = String(fetchMock.mock.calls[0]?.[0] || "");
    expect(params).toContain("file_path=eq.");
    expect(params).toContain("limit=2");
  });

  it("se a RPC falhar a resposta continua negada", async () => {
    select([row]);
    vi.mocked(callDataApiRpc).mockResolvedValueOnce({ok:true, payload:false} as never);
    expect(await authorizePrivateR2DocumentRead(request, key, city))
      .toMatchObject({ok:false, status:403});
  });

  it("falha fechada em indisponibilidade do banco sem simular registro válido", async () => {
    select(null,503);
    expect(await authorizePrivateR2DocumentRead(request, key, city))
      .toMatchObject({ok:false, status:503});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await authorizePrivateR2DocumentRead(request, key, city))
      .toMatchObject({ok:false, status:503});
  });
});
