import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/integrations/backend/databaseClient", () => ({
  backendClient: { auth: { getSession: mocks.getSession } },
}));

import {
  municipalCollectionApiRequest,
  MunicipalCollectionRequestError,
} from "@/lib/municipalCollectionApi";

const municipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";

describe("municipal collection session -> API -> bank/provider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "qa-token" } }, error: null });
  });

  it("uses the authenticated session for bank_get and preserves the municipal scope", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ beneficiary: "Prefeitura QA" }),
    } as Response);
    const data = await municipalCollectionApiRequest<{ beneficiary: string }>("collection-configuration", municipalityId, "bank_get");
    expect(data.beneficiary).toBe("Prefeitura QA");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/collection-configuration");
    expect(options?.method).toBe("POST");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer qa-token" });
    expect(JSON.parse(String(options?.body))).toEqual({ municipalityId, action: "bank_get" });
  });

  it("does not send a banking request using a stale UI session with no token", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(municipalCollectionApiRequest("collection-configuration", municipalityId, "bank_save", { fields: {} }))
      .rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a specific error on a denied payment provider request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Somente administrador municipal." }),
    } as Response);
    await expect(municipalCollectionApiRequest("payment-connection", municipalityId, "get"))
      .rejects.toMatchObject({ status: 403, message: "Somente administrador municipal." });
  });

  it("never reports successful bank saving on a server error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Banco temporariamente indisponível." }),
    } as Response);
    await expect(municipalCollectionApiRequest("collection-configuration", municipalityId, "bank_save", { fields: { pixEnabled: false } }))
      .rejects.toBeInstanceOf(MunicipalCollectionRequestError);
  });

  it("rejects invalid municipality IDs before fetching or obtaining a token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(municipalCollectionApiRequest("collection-configuration", "other-municipality", "bank_get"))
      .rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
