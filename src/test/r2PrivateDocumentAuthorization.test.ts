import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizePrivateR2DocumentRead } from "../../server/api/r2-sign-get";

const municipalityA = "11111111-1111-4111-8111-111111111111";
const municipalityB = "22222222-2222-4222-8222-222222222222";
const objectKey = `municipalities/${municipalityA}/analysis-signed-fiches/a/b.pdf`;
const request = (token = "") => ({
  headers: { authorization: token ? `Bearer ${token}` : "" },
}) as Parameters<typeof authorizePrivateR2DocumentRead>[0];

afterEach(() => vi.unstubAllGlobals());

describe("R2 signed GET municipal document access", () => {
  it("rejects unauthenticated access before calling Neon or R2", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    await expect(authorizePrivateR2DocumentRead(request(), objectKey, municipalityA))
      .resolves.toMatchObject({ ok: false, status: 401 });
    expect(mock).not.toHaveBeenCalled();
  });
  it("uses the authenticated and RLS-filtered process_documents row", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: "document", municipality_id: municipalityA, tenant_id: municipalityA }],
    });
    vi.stubGlobal("fetch", mock);
    await expect(authorizePrivateR2DocumentRead(request("test-token"), objectKey, municipalityA))
      .resolves.toEqual({ ok: true });
    const [url, options] = mock.mock.calls[0];
    expect(url).toContain("/process_documents?");
    expect(String(url)).toContain("file_path=");
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBe("Bearer test-token");
  });
  it("rejects an RLS-invisible file without falling back to a public URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
    await expect(authorizePrivateR2DocumentRead(request("test-token"), objectKey, municipalityA))
      .resolves.toMatchObject({ ok: false, status: 403 });
  });
  it("rejects cross-municipal file rows even if supplied by a broken upstream policy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => [{ municipality_id: municipalityB }],
    }));
    await expect(authorizePrivateR2DocumentRead(request("test-token"), objectKey, municipalityA))
      .resolves.toMatchObject({ ok: false, status: 403 });
  });
  it("fails closed when database authentication, transport or row permission fails", async () => {
    for (const status of [401, 403, 503]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
      const response = await authorizePrivateR2DocumentRead(request("test-token"), objectKey, municipalityA);
      expect(response.ok).toBe(false);
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(authorizePrivateR2DocumentRead(request("test-token"), objectKey, municipalityA))
      .resolves.toMatchObject({ ok: false, status: 503 });
  });
  it("requires authorization before generating a signed URL on either R2 or municipal S3", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("server/api/r2-sign-get.ts", "utf8");
    const guard = src.indexOf("const permission = await authorizePrivateR2DocumentRead(req, objectKey, municipalityId)");
    const municipal = src.indexOf("const municipalTarget = municipalityId");
    const signer = src.indexOf("let signedUrl =");
    expect(guard).toBeGreaterThan(-1);
    expect(municipal).toBeGreaterThan(guard);
    expect(signer).toBeGreaterThan(guard);
    expect(src).toContain("!isPublicLegalDocumentKey(objectKey)");
    expect(src).toContain("authorize_payment_guide_original_read_v1");
  });
});
