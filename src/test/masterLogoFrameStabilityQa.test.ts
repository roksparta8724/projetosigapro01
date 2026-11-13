import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getMasterInstitutionBranding,
  updateMasterBranding,
  type MasterBrandingState,
} from "../lib/masterBranding";

describe("SIGAPRO Master — enquadramento estável na navegação", () => {
  it("não recalibra o logo quando chega metadado remoto do arquivo enquadrado", () => {
    const hook = readFileSync(
      resolve(process.cwd(), "src/hooks/useInstitutionBranding.ts"),
      "utf8",
    );
    const headerStart = hook.indexOf("const headerBranding = useMemo(");
    const footerStart = hook.indexOf("const footerBranding = useMemo(");
    expect(headerStart).toBeGreaterThan(-1);
    expect(footerStart).toBeGreaterThan(headerStart);

    const header = hook.slice(headerStart, footerStart);
    const footer = hook.slice(footerStart);
    expect(header).toContain('getMasterInstitutionBranding(masterBrandingState, "header")');
    expect(footer).toContain('getMasterInstitutionBranding(masterBrandingState, "footer")');
    expect(header).toContain("resolvedMasterHeaderLogoUrl || masterBranding.logoUrl");
    expect(footer).toContain("resolvedMasterFooterLogoUrl || masterBranding.logoUrl");

    // Os nomes de arquivos remotos não autorizam alterar scale/offset em
    // cada remontagem da página: o editor é a fonte do enquadramento.
    expect(header).not.toContain("platformBranding?.headerLogoFileName");
    expect(footer).not.toContain("platformBranding?.footerLogoFileName");
    expect(header).not.toMatch(/logoScale:\s*1\s*,\s*logoOffsetX:\s*0/);
    expect(footer).not.toMatch(/logoScale:\s*1\s*,\s*logoOffsetX:\s*0/);
  });

  it("conserva escala e offsets independentes do cabeçalho e rodapé", () => {
    const stored = {
      logoUrl: "/sigapro-logo.png",
      headerLogoUrl: "/master-header.png",
      footerLogoUrl: "/master-footer.png",
      headerLogoScale: 2.5,
      headerLogoOffsetX: 3,
      headerLogoOffsetY: -2,
      footerLogoScale: 1.7,
      footerLogoOffsetX: -4,
      footerLogoOffsetY: 1,
      logoAlt: "SIGAPRO",
      logoUpdatedAt: "",
      logoUpdatedBy: "",
    } as MasterBrandingState;

    const refreshed = updateMasterBranding(stored, { headerLogoScale: 2.6 });
    const header = getMasterInstitutionBranding(refreshed, "header");
    const footer = getMasterInstitutionBranding(refreshed, "footer");

    expect(header).toMatchObject({
      tenantId: "master",
      logoUrl: "/master-header.png",
      logoScale: 2.6,
      logoOffsetX: 3,
      logoOffsetY: -2,
    });
    expect(footer).toMatchObject({
      tenantId: "master",
      logoUrl: "/master-footer.png",
      logoScale: 1.7,
      logoOffsetX: -4,
      logoOffsetY: 1,
    });
  });

  it("reutiliza o branding remoto do Master entre rotas sem retornar ao default", () => {
    const hook = readFileSync(resolve(process.cwd(), "src/hooks/useInstitutionBranding.ts"), "utf8");
    expect(hook).toContain("let lastMasterPlatformBranding");
    expect(hook).toContain("MASTER_BRANDING_REVALIDATE_MS");
    expect(hook).toContain("loadStableMasterPlatformBranding()");
    expect(hook).toContain("useState<PlatformBrandingSnapshot | null>(() => lastMasterPlatformBranding)");
    expect(hook).not.toContain("setPlatformBranding(null)");
  });

  it("ignora respostas atrasadas de logos R2 e acompanha edições nas duas variantes", () => {
    const hook = readFileSync(resolve(process.cwd(), "src/hooks/useInstitutionBranding.ts"), "utf8");
    const masterResolve = hook.slice(hook.indexOf("const resolveLogo = async"), hook.indexOf("const headerBranding = useMemo"));
    expect(masterResolve).toContain("let active = true");
    expect(masterResolve).toContain("if (!active) return;");
    expect(masterResolve).toContain("return () => { active = false; };");
    expect(masterResolve).toContain("masterBrandingState.headerLogoUrl");
    expect(masterResolve).toContain("masterBrandingState.footerLogoUrl");
  });
});
