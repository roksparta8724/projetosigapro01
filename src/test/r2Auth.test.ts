import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireR2AuthenticatedProfile } from "../../api/_r2-auth";

function requestWithAuthorization(value?: string) {
  return {
    headers: value ? { authorization: value } : {},
  } as any;
}

describe("R2 authenticated gate", () => {
  const previousRequireAuth = process.env.R2_REQUIRE_AUTH;
  const previousDataApiUrl = process.env.R2_AUTH_DATA_API_URL;
  const previousVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.R2_REQUIRE_AUTH;
    delete process.env.R2_AUTH_DATA_API_URL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    if (previousRequireAuth === undefined) delete process.env.R2_REQUIRE_AUTH;
    else process.env.R2_REQUIRE_AUTH = previousRequireAuth;
    if (previousDataApiUrl === undefined) delete process.env.R2_AUTH_DATA_API_URL;
    else process.env.R2_AUTH_DATA_API_URL = previousDataApiUrl;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  });

  it("preserves current behavior while the cutover gate is disabled", async () => {
    const result = await requireR2AuthenticatedProfile(requestWithAuthorization());
    expect(result).toEqual({ ok: true, profileId: null });
  });

  it("rejects requests without a bearer token when protection is enabled", async () => {
    process.env.R2_REQUIRE_AUTH = "true";
    process.env.R2_AUTH_DATA_API_URL = "https://example.test/rest/v1";

    const result = await requireR2AuthenticatedProfile(requestWithAuthorization());

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      error: "Autenticação necessária.",
    });
  });

  it("accepts a bearer token only when Neon resolves an authenticated profile", async () => {
    process.env.R2_REQUIRE_AUTH = "true";
    process.env.R2_AUTH_DATA_API_URL = "https://example.test/rest/v1";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify("profile-123"), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await requireR2AuthenticatedProfile(
      requestWithAuthorization("Bearer jwt-test"),
    );

    expect(result).toEqual({ ok: true, profileId: "profile-123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/rest/v1/rpc/current_profile_id",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-test",
        }),
      }),
    );
  });
  it("requires authentication automatically for protected R2 operations in Vercel production", async () => {
    process.env.VERCEL_ENV = "production";

    const result = await requireR2AuthenticatedProfile(requestWithAuthorization());

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      error: "Autenticação necessária.",
    });
  });

  it("allows explicitly public signed reads in Vercel production", async () => {
    process.env.VERCEL_ENV = "production";

    const result = await requireR2AuthenticatedProfile(
      requestWithAuthorization(),
      { requireInProduction: false },
    );

    expect(result).toEqual({ ok: true, profileId: null });
  });

});
