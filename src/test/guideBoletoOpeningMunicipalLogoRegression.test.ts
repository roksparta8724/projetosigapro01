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

  it("opens new official external guides through the immutable Neon/R2 original instead of a transient HTML preview", () => {
    const section = external.slice(
      external.indexOf("const openExternalGuide = async"),
      external.indexOf("  // Enquanto existe guia inicial pendente"),
    );
    expect(external).toContain('import { archiveAndOpenGuide } from "@/lib/guideOriginal";');
    expect(section).toContain("if (!isolatedQa) {");
    expect(section).toContain("await archiveAndOpenGuide(effectiveScopeId, guideDocument, reservedGuideWindow);");
    expect(section).toContain("return;");
    expect(section.indexOf("await archiveAndOpenGuide(")).toBeLessThan(
      section.indexOf("const opened = openGuiaRecolhimentoOficialWindow("),
    );
    expect(guide).toContain("if (await openStoredGuide(original, target)) return;");
    expect(guide).toContain('if (original.status === "compensada")');
    expect(guide).toContain('"freeze_payment_guide_document_v1"');
    expect(guide).toContain('"attach_payment_guide_original_v1"');
    expect(guide).toContain('if (!original.original_pdf_key || !original.original_pdf_sha256)');
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

  it("does not revive an expired or rejected municipality logo in printable guide HTML", () => {
    // A strict logo fetch may be rejected by isolated QA (503) or expire.
    // The print path must never revert to the same raw, unverified URL.
    expect(process).toContain('setPreparedGuideLogoUrl(embeddedLogo || "");');
    expect(process).toContain("const directGuideLogoFallback = renderedGuideLogoUrl;");
    const fallbackBlock = process.slice(
      process.indexOf("const directGuideLogoFallback = renderedGuideLogoUrl;"),
      process.indexOf("const rawIssuedBy ="),
    );
    expect(fallbackBlock).not.toContain("tenantSettings?.brasaoUrl ||");
    expect(fallbackBlock).not.toContain("tenantSettings?.logoUrl ||");
    expect(fallbackBlock).not.toContain("stableGuideLogoUrl ||");
    expect(fallbackBlock).toContain("prepareGuideInstitutionalLogo(");
  });

  it("keeps QA separate from official R2; missing QA logo is not proof of branch mixing", () => {
    expect(logoRoute).toContain("QA_R2_ACCESS_DISABLED");
    expect(logoRoute).toContain('process.env.VERCEL_ENV === "preview"');
    expect(logoRoute).toContain('process.env.VERCEL_GIT_COMMIT_REF === "qa/sigapro-ia-logo-integrado-20261023"');
  });
});
