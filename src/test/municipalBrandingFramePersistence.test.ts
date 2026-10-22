import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTenantSettingsFromMunicipality } from "@/lib/municipality";
import { getInstitutionBranding } from "@/lib/institutionBranding";
import type { Municipality, MunicipalitySettings } from "@/lib/municipality";
import type { TenantSettings } from "@/lib/platform";

const source = (file: string) => readFileSync(file, "utf8");
const municipality = { id: "municipality-qa", name: "Prefeitura de QA" } as Municipality;
const fallback = { tenantId: "municipality-qa", logoScale: 1, footerLogoScale: 1 } as TenantSettings;

describe("Municipal framing: editor → Neon → page header/footer", () => {
  it("reads distinct saved header and footer geometry from municipality_settings", () => {
    const settings = {
      id: "settings-qa",
      municipalityId: municipality.id,
      protocolPrefix: "SIG",
      guidePrefix: "DAM",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
      requireProfessionalRegistration: true,
      allowDigitalProtocol: true,
      allowWalkinProtocol: false,
      createdAt: "2026-10-22T00:00:00Z",
      updatedAt: "2026-10-22T00:00:00Z",
      generalSettings: {
        header_logo_scale: 1.4,
        header_logo_offset_x: 24,
        header_logo_offset_y: -8,
        footer_logo_scale: 1.8,
        footer_logo_offset_x: -16,
        footer_logo_offset_y: 12,
      },
    } as MunicipalitySettings;
    const compat = buildTenantSettingsFromMunicipality(municipality, null, settings, fallback)!;
    expect(compat.headerLogoScale).toBe(1.4);
    expect(compat.footerLogoScale).toBe(1.8);
    const header = getInstitutionBranding(compat, "Prefeitura", "header");
    const footer = getInstitutionBranding(compat, "Prefeitura", "footer");
    expect([header.logoScale, header.logoOffsetX, header.logoOffsetY]).toEqual([1.4, 24, -8]);
    expect([footer.logoScale, footer.logoOffsetX, footer.logoOffsetY]).toEqual([1.8, -16, 12]);
  });

  it("refreshes the actual settings table on the branding save event, not only the logo URL", () => {
    const hook = source("src/hooks/useMunicipality.tsx");
    expect(hook).toContain('window.addEventListener("sigapro-branding-updated"');
    expect(hook).toContain('backendClient.from("municipality_settings").select("*")');
    expect(hook).toContain("mapMunicipalitySettings(settingsResponse.data");
    expect(hook).toContain("resolvedSettings?.municipalityId === (municipality?.id ?? activeInstitutionId)");
    expect(hook).toContain("resolvedBranding, resolvedSettings");
    expect(hook).toContain("generation !== brandingRefreshGeneration.current");
  });

  it("re-hydrates the framing editor even if only zoom changed, without a new image upload", () => {
    const config = source("src/pages/saas/ConfiguracoesPage.tsx");
    expect(config).toContain('brandingVariant: variant');
    expect(config).toContain("tenantSettingsCompat?.headerLogoScale");
    expect(config).toContain("tenantSettingsCompat?.footerLogoScale");
    expect(config).toContain("tenantSettingsCompat?.footerLogoOffsetX");
    expect(config).toContain("shallowEqualObject(current, nextFooterConfig)");
    expect(config).toContain("O banco não confirmou o enquadramento do logo.");
  });

  it("does not stretch the real site footer or offset its municipal logo tile", () => {
    const footer = source("src/components/platform/PortalFrame.tsx");
    const renderer = source("src/components/platform/InstitutionalLogo.tsx");
    expect(footer).toContain('data-sig-footer-logo-cell="true"');
    expect(footer).toContain('data-sig-footer-grid="true" className="grid min-w-0 items-center');
    expect(footer).toContain('className="!m-0 !shrink-0"');
    expect(renderer).toContain('footer: "h-[144px] w-[144px] max-h-[144px] max-w-[144px] p-0"');
    expect(renderer).toContain('const municipalOffsetX = ((branding.logoOffsetX || 0) / 188) * 100');
  });

  it("keeps each municipality isolated without borrowing framing from a different tenant", () => {
    const hook = source("src/hooks/useInstitutionBranding.ts");
    expect(hook).toContain("tenantSettingsCompat?.tenantId === resolvedInstitutionId");
    expect(hook).toContain("municipalityBranding?.municipalityId === resolvedInstitutionId");
    const provider = source("src/hooks/useMunicipality.tsx");
    expect(provider).toContain('detail.municipalityId !== bundle?.municipality?.id');
  });
});
