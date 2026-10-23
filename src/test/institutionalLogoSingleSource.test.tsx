import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { InstitutionalLogo } from "@/components/platform/InstitutionalLogo";
import type { InstitutionalBranding } from "@/lib/institutionBranding";

const frame = (tenantId: string, url: string): InstitutionalBranding => ({
  tenantId,
  logoUrl: url,
  logoScale: 1.35,
  logoOffsetX: 8,
  logoOffsetY: -6,
  logoAlt: "Marca institucional selecionada",
  logoUpdatedAt: "",
  logoUpdatedBy: "",
  logoFrameMode: "soft-square",
  logoFitMode: "contain",
});

describe("single authoritative institutional logo", () => {
  it("keeps the master viewport fixed without flashing a provisional image", () => {
    const html = renderToStaticMarkup(
      <InstitutionalLogo
        branding={frame("master", "https://assets.example.test/selected-master.png")}
        contextScope="master"
        variant="header"
        ready={false}
      />,
    );
    expect(html).toContain('data-logo-context="sigapro"');
    expect(html).toContain('data-logo-variant="header"');
    expect(html).not.toContain("selected-master.png");
    expect(html).not.toContain("<img");
  });

  it("renders exactly one selected file and no alternate municipal crest", () => {
    const html = renderToStaticMarkup(
      <InstitutionalLogo
        branding={{
          ...frame("prefeitura-qa", "https://assets.example.test/logo-ajustado.png"),
          fallbackLogoUrl: "https://assets.example.test/brasao-antigo.png",
        }}
        contextScope="municipality"
        variant="header"
      />,
    );
    expect(html).toContain("logo-ajustado.png");
    expect(html).not.toContain("brasao-antigo.png");
    expect((html.match(/<img\b/g) ?? [])).toHaveLength(1);
  });

  it("retains its independent master geometry for header and footer", () => {
    const branding = frame("master", "https://assets.example.test/master-logo.png");
    for (const variant of ["header", "footer"] as const) {
      const html = renderToStaticMarkup(<InstitutionalLogo branding={branding} contextScope="master" variant={variant} />);
      expect(html).toContain('data-logo-context="sigapro"');
      expect(html).toContain(`data-logo-variant="${variant}"`);
      expect(html).toContain("master-logo.png");
      expect((html.match(/<img\b/g) ?? [])).toHaveLength(1);
    }
  });

  it("waits for a verified master source and uses the same persisted record for framing", () => {
    const hook = readFileSync(resolve(process.cwd(), "src/hooks/useInstitutionBranding.ts"), "utf8");
    const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
    expect(hook).toContain("lastValidatedMasterBranding");
    expect(hook).toContain("lastValidatedMasterLogoPair");
    expect(hook).toContain("masterSourceKey");
    expect(hook).toContain("platformBranding?.headerLogoScale ?? local.logoScale");
    expect(hook).toContain("platformBranding?.footerLogoScale ?? local.logoScale");
    expect(hook).not.toContain('headerLogoFileName.endsWith("-enquadrado.png")');
    expect(portal).toContain('ready={isMasterUser ? headerLogoReady : !municipalityLoading}');
    expect(portal).toContain('ready={isMasterUser ? footerLogoReady : !municipalityLoading}');
  });
});
