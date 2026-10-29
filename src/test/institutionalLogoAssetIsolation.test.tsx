import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { InstitutionalLogo } from "@/components/platform/InstitutionalLogo";
import type { InstitutionalBranding } from "@/lib/institutionBranding";

const branding = (tenantId: string, logoUrl: string, fallbackLogoUrl: string): InstitutionalBranding => ({
  tenantId,
  logoUrl,
  fallbackLogoUrl,
  logoScale: 1,
  logoOffsetX: 0,
  logoOffsetY: 0,
  logoAlt: "Marca municipal",
  logoUpdatedAt: "",
  logoUpdatedBy: "",
  logoFrameMode: "soft-square",
  logoFitMode: "contain",
});

describe("official institutional logo asset isolation", () => {
  it("shows only the selected municipal logo, never a different fallback crest", () => {
    const html = renderToStaticMarkup(
      <InstitutionalLogo
        branding={branding("prefeitura-qa-a", "https://assets.example.test/official-a.png", "https://assets.example.test/old-b.png")}
        contextScope="municipality"
        variant="header"
      />,
    );
    expect(html).toContain("official-a.png");
    expect(html).not.toContain("old-b.png");
    expect((html.match(/<img\b/g) ?? [])).toHaveLength(1);
  });

  it("ignores a stale cached image if it does not match the current official asset", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/platform/InstitutionalLogo.tsx"), "utf8");
    expect(source).toContain("sameAssetResource(loadedSource.url, imageUrl)");
    expect(source).toContain("sameAssetResource(cachedContextUrl, imageUrl)");
    expect(source).toContain('const secondaryUrl = isMaster ? SIGAPRO_OFFICIAL_LOGO : "";');
  });
});
