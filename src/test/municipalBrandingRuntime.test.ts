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

  it("renews an expired municipal logo from its persistent key without showing an unrelated crest", () => {
    expect(branding).toContain("resolvedTenantHeaderLogoState.tenantId === resolvedInstitutionId");
    expect(branding).toContain("resolvedTenantFooterLogoState.tenantId === resolvedInstitutionId");
    expect(branding).toContain("scopedMunicipalityBranding?.headerLogoObjectKey");
    expect(branding).toContain('bucket: "institutional-branding"');
    expect(branding).toContain("getSignedUrlForObjectStrict");
    expect(branding).toContain("resolvePersistentBrandingReference(base.logoUrl)");
    expect(branding).not.toContain("municipalityLogoFallback");
    expect(branding).toContain("resolvePersistentBrandingReference(base.logoUrl)");
    expect(branding).toContain("institutionSettings?.brasaoUrl");
  });

  it("keeps the municipal logo selected in the working environment ahead of the generic tenant logo", () => {
    const headerBlock = branding.slice(
      branding.indexOf("const primaryHeaderLogo ="),
      branding.indexOf("if (primaryHeaderLogo)", branding.indexOf("const primaryHeaderLogo =")),
    );
    const footerBlock = branding.slice(
      branding.indexOf("const primaryFooterLogo ="),
      branding.indexOf("if (primaryFooterLogo)", branding.indexOf("const primaryFooterLogo =")),
    );

    const headerTenantLogo = headerBlock.indexOf("resolvedTenantHeaderLogoState.tenantId === resolvedInstitutionId");
    const headerLegacyLogo = headerBlock.indexOf("resolvePersistentBrandingReference(base.logoUrl)");
    const footerTenantLogo = footerBlock.indexOf("resolvedTenantFooterLogoState.tenantId === resolvedInstitutionId");
    const footerLegacyLogo = footerBlock.indexOf("resolvePersistentBrandingReference(base.logoUrl)");

    expect(headerTenantLogo).toBeGreaterThanOrEqual(0);
    expect(headerLegacyLogo).toBeGreaterThanOrEqual(0);
    expect(footerTenantLogo).toBeGreaterThanOrEqual(0);
    expect(footerLegacyLogo).toBeGreaterThanOrEqual(0);
    expect(headerTenantLogo).toBeLessThan(headerLegacyLogo);
    expect(footerTenantLogo).toBeLessThan(footerLegacyLogo);
  });

  it("uses the same resolved logo in the configuration preview without replacing a newly selected file", () => {
    expect(settings).toContain("headerBranding.logoUrl");
    expect(settings).toContain("footerBranding.logoUrl");
    expect(settings).toContain("if (current[0]?.file) return current");
    expect(settings).toContain('imageFiles(headerUrl, "header-logo")');
  });

  it("does not wait for remote signed URLs when hydrating official municipal logos", () => {
    const context = read("src/hooks/useMunicipality.tsx");
    const assetClient = read("src/integrations/r2/client.ts");
    expect(context).toContain("withMunicipalLogoOpenUrls");
    expect(context).toContain("getMunicipalityLogoOpenUrl(branding.headerLogoObjectKey)");
    expect(context).toContain("getMunicipalityLogoOpenUrl(branding.footerLogoObjectKey)");
    expect(context).not.toContain("await getSignedUrlForObject(");
    expect(context).not.toContain("getPublicUrl(");
    expect(assetClient).toContain('host === "sigapromunicipal.com.br"');
    expect(assetClient).toContain('host.endsWith(".sigapromunicipal.com.br")');
    expect(assetClient).toContain("return path;");
  });

  it("keeps the configured municipal logo authoritative without showing an unrelated fallback crest", () => {
    expect(branding).toContain("resolvedTenantHeaderLogoState.tenantId === resolvedInstitutionId");
    expect(branding).toContain("resolvedTenantFooterLogoState.tenantId === resolvedInstitutionId");
    expect(branding).toContain("institutionalFallback");
    expect(branding).toContain("institutionSettings?.brasaoUrl");
    expect(branding).not.toContain("municipalityLogoFallback");
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

  it("keeps the exact configured municipal logo across F5 instead of flashing the crest-only fallback", () => {
    expect(branding).toContain('TENANT_LOGO_CACHE_PREFIX = "sigapro.municipality-logo.v3"');
    expect(branding).toContain("readTenantLogoCache");
    expect(branding).toContain("writeTenantLogoCache");
    expect(branding).toContain("synchronousHeaderUrl");
    expect(branding).toContain("synchronousFooterUrl");
    expect(branding).toContain("primaryHeaderLogo");
    expect(branding).toContain("primaryFooterLogo");
    expect(settings).toContain("getMunicipalityLogoOpenUrl");
    expect(settings).toContain('persistentRef.startsWith("r2:")');
    expect(settings).toContain('bucket === "institutional-branding"');
    expect(settings).toContain("getMunicipalityLogoOpenUrl(uploaded.path)");
    expect(settings).not.toContain("domínio público dos ativos institucionais não está configurado");
    expect(settings).toContain("Brasão oficial salvo com sucesso no cadastro desta Prefeitura");
  });

  it("never flashes the SIGAPRO platform logo inside a municipal logo frame during F5", () => {
    expect(logo).toContain('contextScope?: "auto" | "master" | "municipality"');
    expect(logo).toContain('contextScope === "municipality"');
    expect(logo).toContain("sameAssetResource(requestedCandidate, SIGAPRO_OFFICIAL_LOGO)");
    expect(logo).toContain("cachedAtMountAllowed");
    expect(logo).toContain("loadedSourceAllowed");
    expect(logo).toContain("loadedSource.context === context");
    expect(logo).toContain("const pendingUrl =");
    expect(portal).toContain('contextScope={isMasterUser ? "master" : "municipality"}');
    expect(logo).toContain("setFailedSources([])");
    expect(logo).toContain("[context, requestedUrl, secondaryUrl]");
  });

  it("never replays a coat-of-arms fallback over a configured municipal logo during refresh", () => {
    expect(logo).toContain("O cache é isolado por Prefeitura + variante");
    expect(logo).toContain("loadedSource.context === context");
    expect(logo).toContain("pendingIsAuthoritative");
    expect(logo).toContain("Não pré-carregue nem");
    expect(logo).toContain("isAuthoritativeCurrentLogo");
    expect(logo).toContain("Só a imagem configurada entra no cache municipal");
    expect(logo).toContain('parsed.pathname.endsWith("/api/municipality-logo-open")');
    expect(logo).toContain('parsed.searchParams.get("objectKey")');
  });

  it("uses a premium uncropped frame with same-context session continuity", () => {
    expect(logo).toContain('LOGO_SESSION_CACHE_KEY = "sigapro.institutional-logo.v3"');
    expect(logo).toContain("data-logo-variant={variant}");
    expect(surface).toContain("MUNICIPAL LOGO PREMIUM STAGE V17");
    expect(surface).toContain("object-fit:contain !important");
    expect(surface).toContain("transform-origin:center center !important");
    expect(logo).toContain("fitMunicipalLogoFrame({");
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
    expect(settings).toContain("imageUrl={previewHeaderEditorUrl}");
    expect(settings).toContain("imageUrl={previewFooterEditorUrl}");
    expect(settings).toContain("headerBranding.fallbackLogoUrl");
    expect(settings).toContain("footerBranding.fallbackLogoUrl");
    expect(settings).toContain("logoScale: draftHeaderLogoConfig.scale");
    expect(settings).toContain('onResolvedSource={recordConfirmedHeaderSource}');
    expect(settings).toContain('onResolvedSource={recordConfirmedFooterSource}');
    expect(settings).toContain('data-header-original-reference="true"');
    expect(settings).toContain('data-footer-original-reference="true"');
    expect(settings).toContain("logoScale: draftFooterLogoConfig.scale");
    expect(settings).toContain("containBaseRatio={MUNICIPAL_LOGO_BASE_RATIO}");
    expect(logo).toContain('(variant === "footer" || variant === "header")');
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

  it("keeps a safe-fit, full-crest original reference and consistent square geometry in the footer", () => {
    expect(settings).toContain('onResolvedSource={recordConfirmedHeaderSource}');
    expect(settings).toContain('onResolvedSource={recordConfirmedFooterSource}');
    expect(settings).not.toContain('width: 188, minWidth: 188, maxWidth: 188, height: 188');
    expect(settings).toContain('viewportClassName="!h-[188px] !w-[188px]"');
    expect(settings).toContain('data-header-original-reference="true"');
    expect(settings).toContain('setDraftHeaderLogoConfig(fullMunicipalLogoFrame())');
    expect(settings).toContain('data-footer-original-reference="true"');
    expect(settings).toContain('data-municipal-logo-live-preview="footer"');
    expect(settings).toContain('className="relative mx-auto flex h-[144px] w-[144px]');
    expect(settings).toContain("setDraftFooterLogoConfig(fullMunicipalLogoFrame())");
    expect(settings).toContain("setDraftHeaderLogoConfig(fullMunicipalLogoFrame())");
    expect(settings).toContain("setDraftFooterLogoConfig(fullMunicipalLogoFrame())");
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
