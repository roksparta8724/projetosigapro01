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

  it("renews municipality header/footer logos from object keys at runtime", () => {
    expect(branding).toContain("resolvedTenantHeaderLogoUrl");
    expect(branding).toContain("resolvedTenantFooterLogoUrl");
    expect(branding).toContain('bucket: "institutional-branding"');
    expect(branding).toContain("scopedMunicipalityBranding?.headerLogoObjectKey");
    expect(branding).toContain("scopedMunicipalityBranding?.footerLogoObjectKey");
  });

  it("does not reuse an expired persisted logo merely because a URL string exists", () => {
    expect(settings).toContain("getObjectKeyFromPublicUrl(url || \"\")");
    expect(settings).toContain("X-Amz-");
    expect(settings).toContain('bucket: "institutional-branding"');
  });
});
