import { afterEach, describe, expect, it, vi } from "vitest";
import uploadHandler, { buildPublicUrl, isR2AuthRequired as uploadRequiresAuth } from "../../server/api/r2-upload";
import { isR2AuthRequired as deleteRequiresAuth } from "../../server/api/r2-delete";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const municipality = "11111111-1111-4111-8111-111111111111";

describe("SIGAPRO R2: production authentication and private URL policy", () => {
  it("never permits R2 upload/delete auth bypass in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("R2_REQUIRE_AUTH", "false");
    expect(uploadRequiresAuth()).toBe(true);
    expect(deleteRequiresAuth()).toBe(true);
  });

  it("keeps ordinary preview/local override behavior outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("R2_REQUIRE_AUTH", "false");
    expect(uploadRequiresAuth()).toBe(false);
    expect(deleteRequiresAuth()).toBe(false);
    vi.stubEnv("R2_REQUIRE_AUTH", "true");
    expect(uploadRequiresAuth()).toBe(true);
    expect(deleteRequiresAuth()).toBe(true);
  });

  it("never publishes private process PDFs through the R2 public-base setting", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://assets.example.invalid");
    for (const key of [
      `municipalities/${municipality}/protocols/owner/deed.pdf`,
      `municipalities/${municipality}/analysis-signed-fiches/analyst/signed.pdf`,
      `municipalities/${municipality}/processes/p/dam-originals/g/sha.pdf`,
      "unscoped/private.pdf",
    ]) {
      expect(buildPublicUrl("sigapro-documentos", key)).toBe("");
    }
    const legalKey = `municipalities/${municipality}/legislation/zoneamento.pdf`;
    expect(buildPublicUrl("sigapro-documentos", legalKey))
      .toBe(`https://assets.example.invalid/${legalKey}`);
    expect(buildPublicUrl("sigapro-logos", `municipalities/${municipality}/branding/municipal.png`))
      .toContain("/branding/municipal.png");
  });

  it("rejects tenantless uploads from non-master accounts before contacting storage", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("R2_REQUIRE_AUTH", "false");
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      const payload = url.endsWith("/rpc/current_profile_id")
        ? "11111111-1111-4111-8111-111111111111" : false;
      return new Response(JSON.stringify(payload), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }));
    const req = {
      method: "POST",
      headers: { authorization: "Bearer unit-test-token" },
      body: {
        bucket: "process-documents",
        objectKey: "unscoped/arbitrary-upload.pdf",
        contentType: "application/pdf",
        base64: Buffer.from("%PDF-test").toString("base64"),
      },
    } as Parameters<typeof uploadHandler>[0];
    let result = "";
    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn((body?: string) => { result = String(body || ""); }),
    } as unknown as Parameters<typeof uploadHandler>[1];
    await uploadHandler(req, res);
    expect(res.statusCode).toBe(403);
    expect(result).toContain("administrador geral");
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain("/rpc/current_profile_id");
    expect(requests[1]).toContain("/rpc/is_master");
  });
});
