import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal branding runtime resilience", () => {
  const tenant = read("src/hooks/useTenant.tsx");
  const branding = read("src/hooks/useInstitutionBranding.ts");
  const settings = read("src/pages/saas/ConfiguracoesPage.tsx");
  const logo = read("src/components/platform/InstitutionalLogo.tsx");
  const surface = read("src/styles/surface-polarity.css");

  it("builds the browser favicon from a persistent object key instead of trusting an expired signed URL", () => {
    expect(tenant).toContain("branding?.headerLogoObjectKey");
    expect(tenant).toContain("branding?.logoObjectKey");
    expect(tenant).toContain('bucket: "institutional-branding"');
    expect(tenant).toContain("isTemporarySignedUrl");
    expect(tenant).toContain("X-Amz-");
    expect(tenant).toContain("document.createElement(\"link\")");
  });

  it("renews an expired municipal logo from its persistent object key without changing the asset", () => {
    expect(branding).toContain("resolvedTenantHeaderLogoUrl");
    expect(branding).toContain("resolvedTenantFooterLogoUrl");
    expect(branding).toContain("scopedMunicipalityBranding?.headerLogoObjectKey");
    expect(branding).toContain('bucket: "institutional-branding"');
    expect(branding).toContain("getSignedUrlForObjectStrict");
    expect(branding).toContain("isUsableBrandingUrl(base.logoUrl)");
    expect(branding).toContain("municipalityLogoFallback");
    expect(branding).toContain("base.brasaoUrl");
  });

  it("keeps the municipal logo selected in the working environment ahead of the generic tenant logo", () => {
    const headerBlock = branding.slice(
      branding.indexOf("const resolvedTenantHeaderLogo ="),
      branding.indexOf("if (resolvedTenantHeaderLogo)", branding.indexOf("const resolvedTenantHeaderLogo =")),
    );
    const footerBlock = branding.slice(
      branding.indexOf("const resolvedTenantFooterLogo ="),
      branding.indexOf("if (resolvedTenantFooterLogo)", branding.indexOf("const resolvedTenantFooterLogo =")),
    );

    expect(headerBlock.indexOf("resolvedTenantHeaderLogoUrl")).toBeLessThan(
      headerBlock.indexOf("isUsableBrandingUrl(base.logoUrl)"),
    );
    expect(footerBlock.indexOf("resolvedTenantFooterLogoUrl")).toBeLessThan(
      footerBlock.indexOf("isUsableBrandingUrl(base.logoUrl)"),
    );
  });

  it("uses the same resolved logo in the configuration preview without replacing a newly selected file", () => {
    expect(settings).toContain("headerBranding.logoUrl");
    expect(settings).toContain("footerBranding.logoUrl");
    expect(settings).toContain("if (current[0]?.file) return current");
    expect(settings).toContain('imageFiles(headerUrl, "header-logo")');
  });

  it("keeps the configured object-key logo authoritative but never leaves the municipal frame blank", () => {
    expect(branding).toContain("resolvedTenantHeaderLogoUrl");
    expect(branding).toContain("resolvedTenantFooterLogoUrl");
    expect(branding).toContain("institutionalFallback");
    expect(branding).toContain("base.brasaoUrl");
    expect(branding).toContain("municipalityLogoFallback");
    expect(branding).not.toContain("hasPersistedHeaderIdentity");
    expect(branding).not.toContain("hasPersistedFooterIdentity");
    expect(branding).toContain('if (raw.startsWith("r2:")) return false');
  });

  it("uses a stable same-origin municipal logo endpoint before signed-url fallback", () => {
    expect(branding).toContain("getMunicipalityLogoOpenUrl");
    expect(branding).toContain("stableProxyUrl");
    expect(branding).toContain("fallbackLogoUrl: institutionalFallback");
    expect(logo).toContain("municipalFallbackUrl");
    expect(logo).toContain("secondaryUrl");
  });

  it("uses a premium uncropped frame for the municipal logo without stale session cache", () => {
    expect(logo).toContain('LOGO_SESSION_CACHE_KEY = "sigapro.institutional-logo.v2"');
    expect(logo).toContain("data-logo-variant={variant}");
    expect(surface).toContain("MUNICIPAL LOGO PREMIUM STAGE V17");
    expect(surface).toContain("object-fit:contain !important");
    expect(surface).toContain("transform:none !important");
  });

  it("edits exactly the runtime-resolved municipal logo in the frame editor", () => {
    expect(settings).toContain("draftHeaderLogoFiles[0]?.previewUrl ??");
    expect(settings).toContain("headerBranding.logoUrl ??");
    expect(settings).toContain("draftFooterLogoFiles[0]?.previewUrl ??");
    expect(settings).toContain("footerBranding.logoUrl ??");
  });

  it("does not reuse an expired persisted logo merely because a URL string exists", () => {
    expect(settings).toContain("getObjectKeyFromPublicUrl(url || \"\")");
    expect(settings).toContain("X-Amz-");
    expect(settings).toContain('bucket: "institutional-branding"');
  });
});
