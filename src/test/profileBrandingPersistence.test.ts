import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const logo = readFileSync(resolve(process.cwd(), "src/components/platform/InstitutionalLogo.tsx"), "utf8");
const config = readFileSync(resolve(process.cwd(), "src/pages/saas/ConfiguracoesPage.tsx"), "utf8");
const dataHook = readFileSync(resolve(process.cwd(), "src/hooks/usePlatformData.tsx"), "utf8");
const backend = readFileSync(resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"), "utf8");

describe("profile and branding persistence regressions", () => {
  it("keeps search text legible and the magnifier white on both surfaces", () => {
    expect(css).toContain('data-search-surface="dark"');
    expect(css).toContain('data-search-surface="light"');
    expect(css).toContain('background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%) !important');
    expect(css).toContain('stroke: #ffffff !important');
    expect(css).toContain('color: #0f172a !important');
  });

  it("applies saved framing to municipal header and footer logos", () => {
    expect(logo).toContain('const showCrop = variant === "header" || variant === "footer" || variant === "preview"');
    expect(logo).toContain('Math.min(5, branding.logoScale)');
    expect(logo).toContain('transformOrigin: "center center"');
    expect(logo).not.toContain("showMasterCrop");
  });

  it("persists logo framing in municipality settings and verifies the round trip", () => {
    expect(config).toContain("skipMunicipalitySettings: false");
    expect(config).toContain('.from("municipality_settings")');
    expect(config).toContain("footer_logo_scale");
    expect(config).toContain("footer_logo_offset_x");
    expect(config).toContain("footer_logo_offset_y");
    expect(config).toContain("O banco não confirmou o enquadramento do logo");
  });

  it("confirms the saved profile from the database before updating the UI", () => {
    expect(backend).toContain("O banco não confirmou a atualização do perfil.");
    expect(backend).toContain("avatar_url");
    expect(backend).toContain("avatar_scale");
    expect(dataHook).toContain("const confirmedProfile = (await saveRemoteProfile(normalizedProfile))");
    expect(dataHook).toContain("sigapro-profile-updated");
    expect(dataHook).toContain("persistedProfile");
  });
});
