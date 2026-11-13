import { afterEach, describe, expect, it, vi } from "vitest";
import { getR2EndpointCandidates, resolveR2Endpoint } from "../../server/r2-runtime";
import { authorizeR2LogoRead } from "../../server/api/r2-sign-get";
import { getDataApiUrl } from "../../server/municipal-storage";
import { readFileSync } from "node:fs";
import { isR2AuthRequired as isR2UploadAuthRequired } from "../../server/api/r2-upload";
import { isR2AuthRequired as isR2DeleteAuthRequired } from "../../server/api/r2-delete";
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
  it("authenticates ALL remote R2 uploads and deletes even when legacy QA disables auth", () => {
    for (const environment of ["preview", "production"]) {
      vi.stubEnv("VERCEL_ENV", environment);
      vi.stubEnv("R2_REQUIRE_AUTH", "false");
      expect(isR2UploadAuthRequired()).toBe(true);
      expect(isR2DeleteAuthRequired()).toBe(true);
    }
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("R2_REQUIRE_AUTH", "");
    expect(isR2UploadAuthRequired()).toBe(true);
    expect(isR2DeleteAuthRequired()).toBe(true);
    vi.stubEnv("R2_REQUIRE_AUTH", "false");
    expect(isR2UploadAuthRequired()).toBe(false);
    expect(isR2DeleteAuthRequired()).toBe(false);
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
  it("requires owner identity or a verified city administrator to sign a private avatar", async () => {
    const target = "2244ccaa-1111-4111-8111-123456abcdef";
    const viewer = "1244ccaa-1111-4111-8111-123456abcdef";
    const key = "municipalities/" + tenant + "/profiles/avatars/" + target + "/pic.png";
    let currentProfile = viewer;
    let isAdmin = false;
    const fetchSpy = vi.fn(async (url:string,init:{body?:string}) => {
      const fn = url.split("/rpc/")[1];
      const input = JSON.parse(String(init.body||"{}"));
      const payload =
        fn === "current_profile_id" ? currentProfile :
        fn === "is_master" ? false :
        fn === "is_municipality_admin" ? isAdmin :
        fn === "has_tenant_access" ? input.target_tenant === tenant :
        false;
      return {ok:true,status:200,json:async()=>payload};
    });
    vi.stubGlobal("fetch",fetchSpy);

    // An unrelated ordinary member must not sign another profile's image.
    expect(await authorizeR2LogoRead(req("session"),key))
      .toMatchObject({ok:false,status:403});
    // Owner may read their own photo.
    currentProfile = target;
    expect(await authorizeR2LogoRead(req("session"),key)).toEqual({ok:true});
    // An actual admin may inspect people registered in their own city only.
    currentProfile = viewer;
    isAdmin = true;
    expect(await authorizeR2LogoRead(req("session"),key)).toEqual({ok:true});
    expect(await authorizeR2LogoRead(req("session"),
      "municipalities/22222222-2222-4222-8222-222222222222/profiles/avatars/" + target + "/pic.png"))
      .toMatchObject({ok:false,status:403});
    expect(fetchSpy).toHaveBeenCalled();
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
