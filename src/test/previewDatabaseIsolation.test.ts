import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel preview database isolation", () => {
  const source = readFileSync(resolve(process.cwd(), "src/integrations/backend/databaseClient.ts"), "utf8");

  it("requires explicit non-production auth and API endpoints", () => {
    expect(source).toContain("previewEndpointsConfigured");
    expect(source).toContain("isVercelPreviewRuntime");
    expect(source).toContain("VALIDATED_NEON_AUTH_URL");
    expect(source).toContain("VALIDATED_NEON_DATA_API_URL");
    expect(source).toContain("previewEndpointsConfigured ? configuredAuthUrl");
    expect(source).toContain("previewEndpointsConfigured ? configuredDataApiUrl");
  });

  it("prevents Vercel preview from falling back to legacy Supabase", () => {
    const config = readFileSync(resolve(process.cwd(), "src/integrations/backend/config.ts"), "utf8");
    expect(config).toContain('if (resolvedHostname.endsWith(".vercel.app")) return "neon";');
  });

  it("retains the official database for official domains only", () => {
    expect(source).toContain("isNeonProduction || isLocalNeonRuntime");
    expect(source).toContain('endsWith(".vercel.app")');
  });
});
