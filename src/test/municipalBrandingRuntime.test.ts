import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal branding runtime resilience", () => {
  const tenant = read("src/hooks/useTenant.tsx");
  const branding = read("src/hooks/useInstitutionBranding.ts");
  const settings = read("src/pages/saas/ConfiguracoesPage.tsx");
  const logo = read("src/components/platform/InstitutionalLogo.tsx");
  const portal = read("src/components/platform/PortalFrame.tsx");
  const editor = read("src/components/platform/ImageFrameEditor.tsx");
  const upload = read("src/components/platform/FileDropZone.tsx");
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

  it("never flashes the SIGAPRO platform logo inside a municipal logo frame during F5", () => {
    expect(logo).toContain('contextScope?: "auto" | "master" | "municipality"');
    expect(logo).toContain('contextScope === "municipality"');
    expect(logo).toContain("sameAssetResource(requestedCandidate, SIGAPRO_OFFICIAL_LOGO)");
    expect(logo).toContain("cachedMatchesCurrentAsset");
    expect(logo).toContain("loadedSourceAllowed");
    expect(portal).toContain('contextScope={isMasterUser ? "master" : "municipality"}');
    expect(logo).toContain("setFailedSources([])");
    expect(logo).toContain("[context, requestedUrl, secondaryUrl]");
  });

  it("uses a premium uncropped frame for the municipal logo without stale session cache", () => {
    expect(logo).toContain('LOGO_SESSION_CACHE_KEY = "sigapro.institutional-logo.v3"');
    expect(logo).toContain("data-logo-variant={variant}");
    expect(surface).toContain("MUNICIPAL LOGO PREMIUM STAGE V17");
    expect(surface).toContain("object-fit:contain !important");
    expect(surface).toContain("transform-origin:center center !important");
    expect(logo).toContain("Math.max(1, Math.min(5, configuredScale))");
    expect(settings).toContain("minScale={1}");
  });

  it("uses one resilient source for live preview and frame editor", () => {
    expect(settings).toContain("firstRenderablePreviewUrl");
    expect(settings).toContain("const previewHeaderLogoUrl =");
    expect(settings).toContain("const previewFooterLogoUrl =");
    expect(settings).toContain("const previewHeaderDisplayUrl =");
    expect(settings).toContain("const previewFooterDisplayUrl =");
    expect(settings).toContain('data-municipal-logo-live-preview="header"');
    expect(settings).toContain('data-municipal-logo-live-preview="footer"');
    expect(settings).toContain("imageUrl={previewHeaderDisplayUrl}");
    expect(settings).toContain("imageUrl={previewFooterDisplayUrl}");
    expect(settings).toContain("headerBranding.fallbackLogoUrl");
    expect(settings).toContain("footerBranding.fallbackLogoUrl");
    expect(settings).toContain("Math.max(1, draftHeaderLogoConfig.scale)");
    expect(settings).toContain("Math.max(1, draftFooterLogoConfig.scale)");
  });

  it("keeps preview changes isolated from the page chrome and accepts the stable same-origin logo proxy", () => {
    expect(settings).toContain('data-config-brand-panel="header"');
    expect(settings).toContain('data-config-brand-panel="footer"');
    expect(settings).toContain('<PageShell>');
    expect(settings).toContain('className="rounded-[30px] p-5 md:p-6 lg:p-7"');
    expect(editor).toContain('normalized.startsWith("/")');
    expect(surface).not.toContain("CONFIGURACOES MUNICIPAIS PREMIUM V19");
    expect(surface).toContain("ENQUADRAMENTO INSTITUCIONAL EXATO V20");
    expect(surface).toContain("CONTRASTE DO PREVIEW INSTITUCIONAL V21");
  });

  it("keeps the whole crest visible at 1x with one square geometry in preview and editor", () => {
    expect(settings).toContain('width: 188, minWidth: 188, maxWidth: 188, height: 188');
    expect(settings).toContain('viewportClassName="!h-[188px] !w-[188px]"');
    expect(settings).toContain("draftHeaderLogoConfig.scale <= 1.001 ? 0 : draftHeaderLogoConfig.offsetX");
    expect(settings).toContain("draftFooterLogoConfig.scale <= 1.001 ? 0 : draftFooterLogoConfig.offsetX");
    expect(settings).toContain("setDraftHeaderLogoConfig({ scale: 1, offsetX: 0, offsetY: 0 })");
    expect(settings).toContain("setDraftFooterLogoConfig({ scale: 1, offsetX: 0, offsetY: 0 })");
    expect(settings.match(/allowPreview=\{false\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(settings.match(/preparePreviewUrl/g)?.length).toBeGreaterThanOrEqual(2);
    expect(upload).toContain("preparePreviewUrl?: boolean");
    expect(upload).toContain("(!allowPreview && !preparePreviewUrl)");
    expect(editor).toContain('data-image-frame-viewport="true"');
    expect(surface).toContain("width:188px !important");
    expect(surface).toContain("height:188px !important");
    expect(surface).not.toContain("max-width:1540px !important");
  });

  it("does not reuse an expired persisted logo merely because a URL string exists", () => {
    expect(settings).toContain("getObjectKeyFromPublicUrl(url || \"\")");
    expect(settings).toContain("X-Amz-");
    expect(settings).toContain('bucket: "institutional-branding"');
  });
});
