import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataApiUrl } from "../../server/municipal-storage";
import { readFileSync } from "node:fs";

const clientSource = readFileSync("src/integrations/backend/databaseClient.ts", "utf8");
const qaLauncher = readFileSync("scripts/dev-qa.mjs", "utf8");

afterEach(() => { vi.unstubAllEnvs(); });

describe("SIGAPRO localhost Neon Auth/Data API alignment", () => {
  it("uses localhost as Neon Auth trusted origin in QA rather than 127.0.0.1", () => {
    expect(qaLauncher).toContain('?? "8081"');
    expect(qaLauncher).toContain('requestedPort !== "8080" && requestedPort !== "8081"');
    expect(qaLauncher).toContain('[viteCli, "--host", "localhost", "--port", requestedPort, "--strictPort"]');
    expect(qaLauncher).not.toContain('["--host", "127.0.0.1"]');
    expect(qaLauncher).toContain('SIGAPRO_LOCAL_QA_LAUNCH: "true"');
  });

  it("keeps local client on official Auth/Data endpoints unless explicitly isolated", () => {
    expect(clientSource).toContain('VITE_SIGAPRO_NEON_ISOLATED === "true"');
    expect(clientSource).toContain("neonEndpointIdentity(authOverride) === neonEndpointIdentity(dataOverride)");
    expect(clientSource).toContain("neonEndpointIdentity(authOverride) !== neonEndpointIdentity(VALIDATED_NEON_AUTH_URL)");
    expect(clientSource).toContain("isolatedReady ? authOverride : \"\"");
  });

  it("ignores a stray QA Data API env override that would cause JWK not found", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "");
    vi.stubEnv("R2_AUTH_DATA_API_URL", "https://ep-mismatched.apirest.neon.tech/db/rest/v1");
    vi.stubEnv("VITE_NEON_DATA_API_URL", "https://ep-mismatched.apirest.neon.tech/db/rest/v1");
    expect(getDataApiUrl()).toContain("ep-blue-cloud-b4hhgb4t.apirest");
  });

  it("accepts isolated QA only when Auth and Data API use the same branch", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("VITE_NEON_AUTH_URL", "https://ep-my-test.neonauth.example.com/db/auth");
    vi.stubEnv("VITE_NEON_DATA_API_URL", "https://ep-my-test.apirest.example.com/db/rest/v1");
    expect(getDataApiUrl()).toBe("https://ep-my-test.apirest.example.com/db/rest/v1");
  });

  it("blocks isolated production-mode preview without paired endpoints", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("VITE_NEON_AUTH_URL", "");
    vi.stubEnv("VITE_NEON_DATA_API_URL", "");
    expect(() => getDataApiUrl()).toThrow("Homologação Neon isolada inválida");
  });

  it("blocks official Neon endpoint in isolated preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("VITE_NEON_AUTH_URL", "https://ep-blue-cloud-b4hhgb4t.neonauth.c-6.us-east-2.aws.neon.tech/db/auth");
    vi.stubEnv("VITE_NEON_DATA_API_URL", "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/db/rest/v1");
    expect(() => getDataApiUrl()).toThrow("branch não oficial");
  });

  it("accepts matching nonofficial endpoints in isolated preview", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("R2_AUTH_DATA_API_URL", "https://ep-blue-cloud-b4hhgb4t.apirest.example.com/official");
    vi.stubEnv("VITE_NEON_AUTH_URL", "https://ep-isolated.neonauth.example.com/qa/auth");
    vi.stubEnv("VITE_NEON_DATA_API_URL", "https://ep-isolated.apirest.example.com/qa/rest/v1");
    expect(getDataApiUrl()).toBe("https://ep-isolated.apirest.example.com/qa/rest/v1");
  });

  it("fails closed if isolated QA Auth and Data API come from different branches", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("VITE_NEON_AUTH_URL", "https://ep-one.neonauth.example.com/db/auth");
    vi.stubEnv("VITE_NEON_DATA_API_URL", "https://ep-other.apirest.example.com/db/rest/v1");
    expect(() => getDataApiUrl()).toThrow("MESMA branch");
  });
});
