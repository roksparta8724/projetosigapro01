import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataApiUrl } from "../../server/municipal-storage";
import { readFileSync } from "node:fs";

const clientSource = readFileSync("src/integrations/backend/databaseClient.ts", "utf8");

afterEach(() => { vi.unstubAllEnvs(); });

describe("SIGAPRO localhost Neon Auth/Data API alignment", () => {
  it("keeps local client on official Auth/Data endpoints unless explicitly isolated", () => {
    expect(clientSource).toContain('VITE_SIGAPRO_NEON_ISOLATED === "true"');
    expect(clientSource).toContain("neonEndpointIdentity(localAuthOverride) === neonEndpointIdentity(localDataOverride)");
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

  it("fails closed if isolated QA Auth and Data API come from different branches", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("VITE_NEON_AUTH_URL", "https://ep-one.neonauth.example.com/db/auth");
    vi.stubEnv("VITE_NEON_DATA_API_URL", "https://ep-other.apirest.example.com/db/rest/v1");
    expect(() => getDataApiUrl()).toThrow("MESMA branch");
  });
});
