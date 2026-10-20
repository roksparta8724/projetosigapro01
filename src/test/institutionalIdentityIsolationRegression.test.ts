import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const brandingHook = read("src/hooks/useInstitutionBranding.ts");
const logoComponent = read("src/components/platform/InstitutionalLogo.tsx");
const topbar = read("src/components/platform/PortalFrame.tsx");
const profile = read("src/pages/saas/PerfilPage.tsx");

describe("isolamento da identidade visual entre usuários e municípios", () => {
  it("isola os logos hidratados por identificador da Prefeitura", () => {
    expect(brandingHook).toContain("resolvedTenantHeaderLogoState.tenantId === resolvedInstitutionId");
    expect(brandingHook).toContain("resolvedTenantFooterLogoState.tenantId === resolvedInstitutionId");
    expect(brandingHook).toContain("setResolvedTenantHeaderLogo({ tenantId: resolvedInstitutionId, url: headerUrl })");
    expect(brandingHook).toContain("setResolvedTenantFooterLogo({ tenantId: resolvedInstitutionId, url: footerUrl })");
    expect(brandingHook).toContain("stableTenantHeaderLogoRef.current.tenantId === resolvedInstitutionId");
    expect(brandingHook).toContain("stableTenantFooterLogoRef.current.tenantId === resolvedInstitutionId");
    expect(brandingHook).toContain("resolvePersistentBrandingReference(base.logoUrl)");
  });

  it("impede um logo Master de ser reutilizado numa Prefeitura", () => {
    expect(logoComponent).toContain('const context = `${contextScope}:${variant}:${branding.tenantId}`');
    expect(logoComponent).toContain("sameAssetResource(cachedAtMount, SIGAPRO_OFFICIAL_LOGO)");
    expect(logoComponent).toContain("sameAssetResource(requestedCandidate, SIGAPRO_OFFICIAL_LOGO)");
    expect(logoComponent).toContain("loadedSource.context === context");
  });

  it("reinicia o avatar quando o usuário ou a Prefeitura mudam", () => {
    expect(topbar).toContain("getUserProfile(authenticatedProfileId || session.id, session.email)");
    expect(topbar).toContain('key={`${authenticatedProfileId || session.id}:${activeInstitutionId || "global"}`}');
    expect(profile).toContain("getUserProfile(authenticatedProfileId || session.id, profileLookupEmail)");
  });
});
