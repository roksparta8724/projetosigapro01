import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isNeonPreviewHostname, isNeonProductionHostname } from "@/integrations/backend/config";
import { getDataApiUrl } from "../../server/municipal-storage";

const qaAuth = "https://ep-misty-breeze-b4ri8ig0.neonauth.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/auth";
const qaData = "https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";
const prodAuth = "https://ep-blue-cloud-b4hhgb4t.neonauth.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/auth";
const prodData = "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";

afterEach(() => vi.unstubAllEnvs());

describe("QA Neon branch: preview cannot fall back to production", () => {
  it("recognizes actual Vercel preview deployment hostnames", () => {
    expect(isNeonPreviewHostname("projetosigapro01-nr0ni5iyr-roksparta8724s-projects.vercel.app")).toBe(true);
    expect(isNeonPreviewHostname("projetosigapro01-git-neon-first-example.vercel.app")).toBe(true);
    expect(isNeonPreviewHostname("unrelated.vercel.app")).toBe(false);
    expect(isNeonProductionHostname("sigapromunicipal.com.br")).toBe(true);
  });
  it("connects preview Auth, browser and server to the same isolated QA branch", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("VITE_NEON_AUTH_URL", qaAuth);
    vi.stubEnv("VITE_NEON_DATA_API_URL", qaData);
    vi.stubEnv("R2_AUTH_DATA_API_URL", qaData);
    expect(getDataApiUrl()).toBe(qaData);
  });
  it("blocks missing isolated flag and any production or mixed branch URL", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("VITE_NEON_AUTH_URL", qaAuth);
    vi.stubEnv("VITE_NEON_DATA_API_URL", qaData);
    vi.stubEnv("R2_AUTH_DATA_API_URL", prodData);
    expect(() => getDataApiUrl()).toThrow("Ambiente de homologação inválido");
    vi.stubEnv("R2_AUTH_DATA_API_URL", qaData);
    vi.stubEnv("VITE_NEON_AUTH_URL", prodAuth);
    expect(() => getDataApiUrl()).toThrow("Ambiente de homologação inválido");
    vi.stubEnv("VITE_NEON_AUTH_URL", qaAuth);
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "false");
    expect(() => getDataApiUrl()).toThrow("Ambiente de homologação inválido");
  });
  it("guards the browser from silently inheriting the production endpoint", () => {
    const browserClient = readFileSync("src/integrations/backend/databaseClient.ts", "utf8");
    const serverClient = readFileSync("server/municipal-storage.ts", "utf8");
    expect(browserClient).toContain("qaIsolationRequired");
    expect(browserClient).toContain("qaIsolatedReady ? localDataOverride :");
    expect(browserClient).toContain("neonEndpointIdentity(VALIDATED_NEON_AUTH_URL)");
    expect(serverClient).toContain('process.env.VERCEL_ENV === "preview"');
    expect(serverClient).toContain("authHost !== serverHost");
  });
});
