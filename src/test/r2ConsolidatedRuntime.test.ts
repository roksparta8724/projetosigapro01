import { afterEach, describe, expect, it, vi } from "vitest";
import { getR2EndpointCandidates, resolveR2Endpoint } from "../../server/r2-runtime";
import { authorizeR2LogoRead } from "../../server/api/r2-sign-get";
import { getDataApiUrl } from "../../server/municipal-storage";
import { readFileSync } from "node:fs";
const tenant = "11111111-1111-4111-8111-111111111111";
const req = (token = "") =>
  ({ headers: token ? { authorization: `Bearer ${token}` } : {} } as Parameters<typeof authorizeR2LogoRead>[0]);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("SIGAPRO consolidated R2 runtime", () => {
  it("prefers configured R2 endpoint over stale account ID", () => {
    vi.stubEnv("R2_ENDPOINT","https://correct.r2.cloudflarestorage.com/a");
    vi.stubEnv("R2_ACCOUNT_ID","stale");
    expect(getR2EndpointCandidates()).toEqual([
      "https://correct.r2.cloudflarestorage.com","https://stale.r2.cloudflarestorage.com"
    ]);
    expect(resolveR2Endpoint()).toBe("https://correct.r2.cloudflarestorage.com");
  });
  it("rejects insecure HTTP endpoint, retaining valid HTTPS account fallback", () => {
    vi.stubEnv("R2_ENDPOINT","http://bad.example");
    vi.stubEnv("R2_ACCOUNT_ID","safe");
    expect(resolveR2Endpoint()).toBe("https://safe.r2.cloudflarestorage.com");
  });
  it("never uses QA Neon Data API on production even if legacy variables exist", () => {
    vi.stubEnv("VERCEL_ENV","production");
    vi.stubEnv("R2_AUTH_DATA_API_URL","https://stale-qa.example/rest/v1");
    vi.stubEnv("VITE_NEON_DATA_API_URL","https://stale-qa.example/rest/v1");
    expect(getDataApiUrl()).toContain("ep-blue-cloud-b4hhgb4t.apirest.");
    expect(getDataApiUrl()).not.toContain("stale-qa");
  });
  it("denies presigned avatars to unauthenticated callers", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch",fetch);
    expect(await authorizeR2LogoRead(req(),`municipalities/${tenant}/profiles/avatars/a/pic.png`))
      .toMatchObject({ok:false,status:401});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("applies tenant authorization before signing a private avatar", async () => {
    vi.stubGlobal("fetch",vi.fn(async (_url:string,init:{body?:string}) => ({
      ok:true,status:200,json:async()=> JSON.parse(String(init.body||"{}")).target_tenant===tenant
    })));
    expect(await authorizeR2LogoRead(req("session"),`municipalities/${tenant}/profiles/avatars/a/pic.png`))
      .toEqual({ok:true});
    expect(await authorizeR2LogoRead(req("session"),"municipalities/22222222-2222-4222-8222-222222222222/profiles/avatars/a/pic.png"))
      .toMatchObject({ok:false,status:403});
  });
  it("retains intentional public municipality and platform logos", async () => {
    expect(await authorizeR2LogoRead(req(),`municipalities/${tenant}/branding/logo.png`)).toEqual({ok:true});
    expect(await authorizeR2LogoRead(req(),"platform/branding/brand.webp")).toEqual({ok:true});
  });
  it("removes duplicate policy implementations from all eight endpoints", () => {
    for (const file of ["server/api/r2-upload.ts","server/api/r2-delete.ts",
      "server/api/r2-sign-get.ts","server/api/r2-list-user-files.ts",
      "server/api/r2-master-logo-source.ts","server/api/profile-avatar-open.ts",
      "api/municipality-logo-open.ts","api/legislation-open.ts"]) {
      const source = readFileSync(file,"utf8");
      expect(source).toContain("r2-runtime.js");
      expect(source).not.toContain("function resolveR2Endpoint()");
      expect(source).not.toContain("function getR2EndpointCandidates()");
    }
    for(const file of ["server/api/r2-upload.ts","server/api/r2-delete.ts","server/api/r2-list-user-files.ts"]) {
      const source=readFileSync(file,"utf8");
      expect(source).toContain("getDataApiUrl()");
      expect(source).not.toContain("VALIDATED_NEON_DATA_API_URL");
    }
  });
});
