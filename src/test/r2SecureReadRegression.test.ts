import { describe, expect, it, vi } from "vitest";
import { resolveR2BearerToken } from "@/integrations/r2/client";
import { deriveBrandingObjectKey } from "@/components/GuiaRecolhimentoOficial";

describe("secure local R2 document access", () => {
  it("prefers Neon's official JWT getter for protected API requests", async () => {
    const getJWTToken = vi.fn(async () => "jwt-from-neon");
    const getSession = vi.fn(async () => ({
      data: { session: { access_token: "legacy-session-token" } },
    }));

    await expect(resolveR2BearerToken({ getJWTToken, getSession })).resolves.toBe("jwt-from-neon");
    expect(getJWTToken).toHaveBeenCalledTimes(1);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("falls back to the Supabase-compatible session token shape", async () => {
    const getSession = vi.fn(async () => ({
      data: { session: { access_token: "session-jwt" } },
    }));

    await expect(resolveR2BearerToken({ getSession })).resolves.toBe("session-jwt");
  });

  it("does not fabricate an authorization token when auth is unavailable", async () => {
    await expect(resolveR2BearerToken(null)).resolves.toBe("");
  });

  it("recovers the persistent municipal logo key from an expired signed R2 URL", () => {
    const stale =
      "https://sigapro-logos.example.r2.cloudflarestorage.com/" +
      "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/branding/header-logo.jpg" +
      "?X-Amz-Date=20261009T213721Z&X-Amz-Expires=21600";

    expect(deriveBrandingObjectKey(stale)).toBe(
      "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/branding/header-logo.jpg",
    );
  });

  it("rejects unrelated URLs as branding keys", () => {
    expect(deriveBrandingObjectKey("https://example.com/not-a-brand/logo.svg")).toBe("");
  });
});
