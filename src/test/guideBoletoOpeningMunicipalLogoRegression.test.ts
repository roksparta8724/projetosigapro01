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
      external.indexOf("  // Enquanto existe guia inicial pendente"),
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
    expect(external).toContain('from "@/lib/guideOriginal";');
    expect(external).toContain("archiveAndOpenGuide, isGuideSettled, openLegacyGuideOriginal, openStoredGuide, readGuideOriginal");
    expect(section).toContain("if (!isolatedQa) {");
    expect(section).toContain("await archiveAndOpenGuide(effectiveScopeId, guideDocument, reservedGuideWindow);");
    expect(section).toContain("return;");
    expect(section.indexOf("await archiveAndOpenGuide(")).toBeLessThan(
      section.indexOf("const opened = openGuiaRecolhimentoOficialWindow("),
    );
    expect(guide).toContain("if (await openStoredGuide(original, target)) return;");
    expect(guide).toContain('if (isGuideSettled(original))');
    expect(guide).toContain('"freeze_payment_guide_document_v1"');
    expect(guide).toContain('"attach_payment_guide_original_v1"');
    expect(guide).toContain('if (!original.original_pdf_key || !original.original_pdf_sha256)');
  });

  it("opens existing originals before billing and uses only re-read Neon data for new registered PDFs", () => {
    const section = external.slice(
      external.indexOf("const openExternalGuide = async"),
      external.indexOf("  // Enquanto existe guia inicial pendente"),
    );
    const storedRead = section.indexOf("officialOriginal = await readGuideOriginal(effectiveScopeId, guide.code)");
    const alreadyArchived = section.indexOf("await openStoredGuide(officialOriginal, reservedGuideWindow)");
    const createOrder = section.indexOf("await ensureMercadoPagoGuideCharge(");
    expect(storedRead).toBeGreaterThan(0);
    expect(alreadyArchived).toBeGreaterThan(storedRead);
    expect(createOrder).toBeGreaterThan(alreadyArchived);
    expect(section).toContain('if (isGuideSettled(officialOriginal))');
    expect(section).toContain("let confirmedOriginal = !isolatedQa && charge");
    expect(section).toContain('"qa_mp_pix_bind_to_guide_v1"');
    expect(section).toContain("confirmedOriginal = await readGuideOriginal(effectiveScopeId, guide.code);");
    expect(section).toContain("await readGuideOriginal(effectiveScopeId, guide.code)");
    expect(section).toContain("confirmedOriginal?.barcode, confirmedOriginal?.digitable_line");
    expect(section).toContain("dataDocumento: issuedAt");
    expect(section).toContain("vencimento: originalDueDate");
    expect(section).toContain("valorDocumento: originalAmount");
    expect(section).toContain("valorCobrado: originalAmount");
    expect(section).toContain("await archiveAndOpenGuide(effectiveScopeId, guideDocument, reservedGuideWindow)");
  });

  it("always opens the recorded SHA original before any exact historical PDF, both internally and externally", () => {
    const internalFlow = process.slice(
      process.indexOf("const printGuide = async"),
      process.indexOf("const runProcessAction = async"),
    );
    const externalFlow = external.slice(
      external.indexOf("const openExternalGuide = async"),
      external.indexOf("  // Enquanto existe guia inicial pendente"),
    );
    for (const [flow, canonical, legacy] of [
      [internalFlow, "await openStoredGuide(original, reservedGuideWindow)", "await openLegacyGuideOriginal(process.documents, original.guide_number, reservedGuideWindow)"],
      [externalFlow, "await openStoredGuide(officialOriginal, reservedGuideWindow)", "await openLegacyGuideOriginal(process.documents, officialOriginal.guide_number, reservedGuideWindow)"],
    ]) {
      const canonicalIndex = flow.indexOf(canonical);
      const legacyIndex = flow.indexOf(legacy);
      expect(canonicalIndex).toBeGreaterThan(0);
      expect(legacyIndex).toBeGreaterThan(canonicalIndex);
      expect(flow.indexOf("if (isGuideSettled(", legacyIndex)).toBeGreaterThan(legacyIndex);
    }
  });

  it("shows boleto issuance only on authenticated isolated localhost or the fixed QA preview, never arbitrary hosts", () => {
    expect(external).toContain('const localQaBankIssuer = isolatedQaMode');
    expect(external).toContain('["localhost", "127.0.0.1"].includes(window.location.hostname)');
    expect(external).toContain('["8080", "8081"].includes(window.location.port)');
    expect(external).toContain('const qaBoletoIssuer = qaPixIssuer;');
    expect(external).toContain('window.location.hostname === "projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app"');
    expect(external).toContain("if (!qaBoletoIssuer || !effectiveScopeId || busyGuideAction");
    expect(external).toContain('{qaBoletoIssuer && !isGuideSettled(guide) && !guide.bankReference ? (');
    expect(external).toContain('if (current.pix_code)');
    expect(external).not.toContain('{isolatedQaMode && guide.status !== "compensada" ? (');
    expect(external).toContain("isGuideSettled(guide)");
    expect(external).not.toContain('const due = new Date(guide.dueDate)');
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
    const guard = process.indexOf("if (!isolatedQa && !paidGuide && (!barcode || !digitableLine))");
    const catchBranch = process.indexOf("reservedGuideWindow.close();", guard);
    expect(guard).toBeGreaterThan(0);
    expect(process.slice(guard, guard + 630)).toContain("throw new Error(");
    expect(catchBranch).toBeGreaterThan(guard);
  });

  it("internal QA renders explicit non-payable municipal preview without calling the production bank or R2", () => {
    const section = process.slice(process.indexOf("const printGuide = async"), process.indexOf("const runProcessAction = async"));
    expect(section).toContain('const isolatedQa = import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true";');
    expect(section).toContain("const providerCharge = isolatedQa || (banking.barcode && banking.digitableLine) ? null");
    expect(section).toContain('nonPayablePreview: isolatedQa && !verifiedQaBoleto');
    expect(section).toContain('pixPayload: isolatedQa ? ""');
    expect(section).toContain("DOCUMENTO DE HOMOLOGAÇÃO — NÃO PAGAR.");
    expect(section).toContain("verifiedQaBoleto ? qaCanonicalBanking.barcode :");
    expect(section).toContain("verifiedQaBoleto ? qaCanonicalBanking.digitableLine :");
    expect(section).toContain("original.provider_environment === \"test\"");
    expect(section).toContain("original.payment_provider === \"mercado_pago\"");
    expect(section).toContain("if (verifiedQaBoleto) {");
    expect(section).toContain("if (isolatedQa) {");
    const preview = section.lastIndexOf("openGuiaRecolhimentoOficialWindow(");
    const archived = section.lastIndexOf("await archiveAndOpenGuide(");
    expect(preview).toBeGreaterThan(0);
    expect(archived).toBeGreaterThan(preview);
    expect(section.slice(preview,archived)).toContain("return;");
  });

  it("never regenerates a paid original and does not require PIX for verified bank barcode", () => {
    expect(guide).toContain('if (isGuideSettled(original))');
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
