import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal branding runtime resilience", () => {
  const tenant = read("src/hooks/useTenant.tsx");
  const branding = read("src/hooks/useInstitutionBranding.ts");
  const settings = read("src/pages/saas/ConfiguracoesPage.tsx");

  it("builds the browser favicon from a persistent object key instead of trusting an expired signed URL", () => {
    expect(tenant).toContain("branding?.headerLogoObjectKey");
    expect(tenant).toContain("branding?.logoObjectKey");
    expect(tenant).toContain('bucket: "institutional-branding"');
    expect(tenant).toContain("isTemporarySignedUrl");
    expect(tenant).toContain("X-Amz-");
    expect(tenant).toContain("document.createElement(\"link\")");
  });

  it("keeps the visible municipal logo priority stable instead of replacing it from the object key", () => {
    expect(branding).toContain("const resolvedTenantHeaderLogo =\n      brandingUrl ||");
    expect(branding).toContain("const resolvedTenantFooterLogo =\n      brandingUrl ||");
    expect(branding).toContain("isUsableBrandingUrl(base.logoUrl)");
    expect(branding).toContain("municipalityLogoFallback");
    expect(branding).not.toContain("resolvedTenantHeaderLogoUrl");
    expect(branding).not.toContain("resolvedTenantFooterLogoUrl");
  });

  it("does not reuse an expired persisted logo merely because a URL string exists", () => {
    expect(settings).toContain("getObjectKeyFromPublicUrl(url || \"\")");
    expect(settings).toContain("X-Amz-");
    expect(settings).toContain('bucket: "institutional-branding"');
  });
});
