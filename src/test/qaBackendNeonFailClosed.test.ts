import { describe, expect, it } from "vitest";
import { isNeonQaHostname, resolveBackendMode } from "../integrations/backend/config";
import { readFileSync } from "node:fs";

describe("SIGAPRO isolated QA browser never selects legacy Supabase", () => {
  const qa = "projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app";

  it("recognizes only the stable QA deployment host", () => {
    expect(isNeonQaHostname(qa)).toBe(true);
    expect(isNeonQaHostname("sigapromunicipal.com.br")).toBe(false);
    expect(isNeonQaHostname("evil-example.com")).toBe(false);
    expect(isNeonQaHostname("projetosigapro01-git-qa-sigapro-evil.example.com")).toBe(false);
  });

  it("forces Neon on QA even with inherited VITE_BACKEND=supabase", () => {
    expect(resolveBackendMode({ hostname: qa, configured: "supabase" })).toBe("neon");
    expect(resolveBackendMode({ hostname: "sigapromunicipal.com.br", configured: "supabase" })).toBe("neon");
  });

  it("preserves explicit legacy rollback for ordinary development hosts", () => {
    expect(resolveBackendMode({ hostname: "localhost", configured: "supabase" })).toBe("supabase");
  });

  it("uses strict QA endpoint pair selection when QA host is recognized", () => {
    const source=readFileSync("src/integrations/backend/databaseClient.ts","utf8");
    expect(source).toContain('isNeonQaHostname(window.location.hostname)');
    expect(source).toContain("isolatedReady ? authOverride : \"\"");
    expect(source).toContain("isolatedReady ? dataOverride : \"\"");
  });
});
