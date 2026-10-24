import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveNeonAuthWebhookBaseUrl } from "../../api/neon-auth-email";

const QA_AUTH = "https://ep-qa-fixture.neonauth.c-6.us-east-2.aws.neon.tech/qa/auth";
const QA_DATA = "https://ep-qa-fixture.apirest.c-6.us-east-2.aws.neon.tech/qa/rest/v1";
const OFFICIAL_AUTH = "https://ep-blue-cloud-b4hhgb4t.neonauth.c-6.us-east-2.aws.neon.tech/qa/auth";
const OFFICIAL_DATA = "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/qa/rest/v1";

afterEach(() => vi.unstubAllEnvs());

describe("SIGAPRO Neon Auth webhook JWKS environment isolation", () => {
  function enableQa() {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("VITE_NEON_AUTH_URL", QA_AUTH + "/");
    vi.stubEnv("VITE_NEON_DATA_API_URL", QA_DATA);
    vi.stubEnv("NEON_AUTH_BASE_URL", OFFICIAL_AUTH);
  }

  it("selects QA Auth JWKS, ignoring stale official webhook env", () => {
    enableQa();
    expect(resolveNeonAuthWebhookBaseUrl()).toBe(QA_AUTH);
  });

  it("rejects QA Auth without matching Data API branch", () => {
    enableQa();
    vi.stubEnv("VITE_NEON_DATA_API_URL",
      "https://ep-other.apirest.c-6.us-east-2.aws.neon.tech/qa/rest/v1");
    expect(() => resolveNeonAuthWebhookBaseUrl()).toThrow("mesma branch isolada");
  });

  it("rejects missing QA Auth rather than falling back to official Neon", () => {
    enableQa();
    vi.stubEnv("VITE_NEON_AUTH_URL", "");
    expect(() => resolveNeonAuthWebhookBaseUrl()).toThrow("mesma branch isolada");
  });

  it("rejects QA mode pointed to official Neon endpoints", () => {
    enableQa();
    vi.stubEnv("VITE_NEON_AUTH_URL", OFFICIAL_AUTH);
    vi.stubEnv("VITE_NEON_DATA_API_URL", OFFICIAL_DATA);
    expect(() => resolveNeonAuthWebhookBaseUrl()).toThrow("mesma branch isolada");
  });

  it("rejects non-HTTPS or non-Neon Auth URLs in QA", () => {
    enableQa();
    vi.stubEnv("VITE_NEON_AUTH_URL", "http://ep-qa-fixture.neonauth.c-6.us-east-2.aws.neon.tech/qa/auth");
    expect(() => resolveNeonAuthWebhookBaseUrl()).toThrow("mesma branch isolada");
  });

  it("keeps production webhook endpoint behavior unchanged", () => {
    enableQa();
    vi.stubEnv("VERCEL_ENV", "production");
    expect(resolveNeonAuthWebhookBaseUrl()).toBe(OFFICIAL_AUTH);
  });
});
