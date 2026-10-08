import { describe, expect, it } from "vitest";
import {
  isNeonProductionHostname,
  isNeonPreviewHostname,
  resolveBackendMode,
} from "@/integrations/backend/config";

describe("backend cutover routing", () => {
  it("routes the official root domain to Neon even with stale Supabase config", () => {
    expect(
      resolveBackendMode({
        hostname: "sigapromunicipal.com.br",
        configured: "supabase",
      }),
    ).toBe("neon");
  });

  it("routes municipal subdomains to Neon", () => {
    expect(
      resolveBackendMode({
        hostname: "campolimpopaulista.sigapromunicipal.com.br",
        configured: "supabase",
      }),
    ).toBe("neon");
  });

  it("does not match lookalike domains", () => {
    expect(isNeonProductionHostname("sigapromunicipal.com.br.evil.test")).toBe(false);
  });

  it("keeps the isolated migration preview on Neon", () => {
    const host =
      "projetosigapro01-git-neon-first-5a62c6-roksparta8724s-projects.vercel.app";
    expect(isNeonPreviewHostname(host)).toBe(true);
    expect(resolveBackendMode({ hostname: host, configured: "" })).toBe("neon");
  });

  it("keeps unrelated hosts on configured Supabase", () => {
    expect(
      resolveBackendMode({
        hostname: "localhost",
        configured: "supabase",
      }),
    ).toBe("supabase");
  });
});
