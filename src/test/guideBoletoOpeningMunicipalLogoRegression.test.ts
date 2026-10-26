import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const external = readFileSync("src/pages/saas/ExternalPaymentsPage.tsx", "utf8");
const process = readFileSync("src/pages/saas/ProcessDetailPage.tsx", "utf8");
const guide = readFileSync("src/lib/guideOriginal.ts", "utf8");
const logoRoute = readFileSync("api/municipality-logo-open.ts", "utf8");

describe("SIGAPRO — boleto/PDF abre sem misturar municípios e versões", () => {
  it("reserva a aba sincronamente antes de consulta bancária/brasão assíncrona", () => {
    const section = external.slice(
      external.indexOf("const openExternalGuide = async"),
      external.indexOf("const openExternalGuide = async") + 10500,
    );
    const reserve = section.indexOf("const reservedGuideWindow = reserveGuiaRecolhimentoOficialWindow(");
    const provider = section.indexOf("resolveGuideBankingData(");
    const logo = section.indexOf("await prepareGuideInstitutionalLogo(");
    expect(reserve).toBeGreaterThan(0);
    expect(provider).toBeGreaterThan(reserve);
    expect(logo).toBeGreaterThan(reserve);
    expect(section).toContain("}, reservedGuideWindow)");
    expect(section).toContain("reservedGuideWindow.close()");
  });

  it("uses the current municipality's stored branding, not just the old logoUrl", () => {
    expect(external).toContain("branding: municipalityBranding");
    expect(external).toContain("useInstitutionBranding(effectiveScopeId)");
    expect(external).toContain("municipalityBranding?.headerLogoObjectKey");
    expect(external).toContain("getMunicipalityLogoOpenUrl(");
    expect(external).toContain("headerBranding.logoUrl");
    expect(external).toContain("headerBranding.fallbackLogoUrl");
    expect(external).toContain("tenantSettings?.headerLogoUrl");
    expect(external).toContain("getRenderedMunicipalityLogoDataUrl()");
  });

  it("closes the internal reserved tab when the boleto bank data cannot be confirmed", () => {
    const guard = process.indexOf("if (!paidGuide && (!barcode || !digitableLine))");
    const catchBranch = process.indexOf("reservedGuideWindow.close();", guard);
    expect(guard).toBeGreaterThan(0);
    expect(process.slice(guard, guard + 630)).toContain("throw new Error(");
    expect(catchBranch).toBeGreaterThan(guard);
  });

  it("never regenerates a paid original and does not require PIX for verified bank barcode", () => {
    expect(guide).toContain('if (original.status === "compensada")');
    expect(guide).toContain("hasVerifiableGuidePaymentData");
    expect(guide).toContain("normalizeOfficialBanking(");
    expect(guide).toContain("if (props.guia.nonPayablePreview) return false");
  });

  it("keeps QA separate from official R2; missing QA logo is not proof of branch mixing", () => {
    expect(logoRoute).toContain("QA_R2_ACCESS_DISABLED");
    expect(logoRoute).toContain('process.env.VERCEL_ENV === "preview"');
    expect(logoRoute).toContain('process.env.VERCEL_GIT_COMMIT_REF === "qa/sigapro-ia-logo-integrado-20261023"');
  });
});
