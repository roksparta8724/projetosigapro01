import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("Habite-se guide branding and status contrast", () => {
  const detail = read("src/pages/saas/ProcessDetailPage.tsx");
  const assets = read("src/lib/guideAssets.ts");
  const guide = read("src/components/GuiaRecolhimentoOficial.tsx");
  const permit = read("src/components/platform/HabiteSePermitPanel.tsx");
  const permitPdf = read("src/lib/habiteSePermitPdf.ts");
  const css = read("src/index.css");

  it("keeps the municipality logo available even when a Habite-se guide is opened immediately after issuance", () => {
    expect(assets).toContain("export function getRenderedMunicipalityLogoDataUrl");
    expect(assets).toContain("imageElementToDataUrl");
    expect(detail).toContain("getRenderedMunicipalityLogoDataUrl");
    expect(detail).toContain("prewarmTenantSettings?.headerLogoUrl");
    expect(detail).toContain("prewarmTenantSettings?.brasaoUrl");
    expect(detail).toContain("const renderedGuideLogoUrl = getRenderedMunicipalityLogoDataUrl()");
    expect(detail).toContain("preparedGuideLogoUrl ||");
    expect(detail).toContain("renderedGuideLogoUrl ||");
    expect(detail).toContain("tenantSettings?.headerLogoUrl ||");
    expect(detail).toContain("tenantSettings?.brasaoUrl ||");
    expect(detail).toContain("logoUrl: embeddedGuideLogoUrl");
    expect(detail).toContain("reserveGuiaRecolhimentoOficialWindow");
    expect(detail).toContain("await prepareGuideInstitutionalLogo(");
    expect(detail).toContain("reservedGuideWindow");
    expect(guide).toContain("export function reserveGuiaRecolhimentoOficialWindow");
    expect(guide).toContain("reservedWindow && !reservedWindow.closed");
    expect(guide).toContain("popup.location.replace(previewUrl)");
  });

  it("keeps the Habite-se signature workflow exclusive to the municipal Director", () => {
    expect(permit).toContain("userCanSignPermitAsDirector(session)");
    expect(permit).toContain("saveAndForwardToDirector");
    expect(permit).toContain('signerSlot: "diretoria"');
    expect(permit).toContain("setHabiteSePermitAwaitingDirector(process.id)");
    expect(permit).toContain("finalizeHabiteSePermit(process.id)");
    expect(permit).not.toContain('openSignature("analyst")');
    expect(permit).not.toContain('signerSlot: passwordDialog === "analyst"');
    expect(permit).not.toContain("Assinatura do Analista Técnico");
    expect(permitPdf).not.toContain("analystSignature?:");
    expect(permitPdf).not.toContain('"Analista Técnico",');
    expect(permitPdf).toContain('"Diretoria responsável",');
  });

  it("matches the Construction Permit request-signature workflow without amateur warning banners", () => {
    expect(permit).toContain('data-request-director-signature="true"');
    expect(permit).toContain("Solicitar assinatura eletrônica do Diretor");
    expect(permit).toContain('data-habite-se-director-request="pending"');
    expect(permit).toContain("Solicitação enviada à Diretoria");
    expect(permit).toContain("setHabiteSePermitAwaitingDirector(process.id)");
    expect(permit).not.toContain("Esta versão foi retificada após a última assinatura");
    expect(permit).not.toContain("Salvar e encaminhar à Diretoria");
  });

  it("hard-locks the Habite-se status badge to readable light text on saturated backgrounds", () => {
    expect(permit).toContain('data-habite-se-status-badge="true"');
    expect(permit).toContain('data-status={permit?.status || "rascunho"}');
    expect(permit).toContain('bg-[#075985]');
    expect(permit).toContain('font-black');
    expect(permit).toContain('<span className="!text-white">');
    expect(css).toContain("HABITE-SE FINAL STATUS CONTRAST LOCK");
    expect(css).toContain('[data-habite-se-status-badge="true"]');
    expect(css).toContain("-webkit-text-fill-color: #ffffff !important");
    expect(css).toContain('[data-status="rascunho"]');
    expect(css).toContain("background: #075985 !important");
  });
});
