import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildConstructionPermitNumber } from "@/lib/constructionPermit";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("construction permit workflow", () => {
  const panel = read("src/components/platform/ConstructionPermitPanel.tsx");
  const pdf = read("src/lib/constructionPermitPdf.ts");
  const api = read("api/e-sign-artifact.ts");
  const detail = read("src/pages/saas/ProcessDetailPage.tsx");
  const app = read("src/App.tsx");
  const verificationPage = read("src/pages/saas/PublicSignatureVerificationPage.tsx");
  const verificationMigration = read(
    "neon/migrations/20261017_public_artifact_signature_verification.sql",
  );
  const migration = read(
    "neon/migrations/20261016_construction_permit_workflow.sql",
  );

  it("creates a stable municipal permit number", () => {
    expect(buildConstructionPermitNumber("PM-2026-00002")).toBe(
      "ALV-2026-000002",
    );
  });

  it("persists permit data in the official database", () => {
    expect(panel).toContain("saveOfficialConstructionPermitDraft");
    expect(panel).toContain("getOfficialConstructionPermit");
    expect(migration).toContain("process_construction_permits");
    expect(migration).toContain("save_construction_permit_draft_v1");
  });

  it("keeps the two signing paths visible while the form scrolls", () => {
    expect(panel).toContain("sticky bottom-0");
    expect(panel).toContain("Enviar ao Diretor para assinar eletronicamente");
    expect(panel).toContain("Gerar PDF do Alvará para assinatura à caneta");
  });

  it("offers the two director signature paths before PDF completion", () => {
    expect(panel).toContain("Enviar ao Diretor para assinar eletronicamente");
    expect(panel).toContain("Gerar PDF do Alvará para assinatura à caneta");
    expect(panel).toContain("requestOfficialPermitDirectorSignature");
    expect(panel).toContain("markOfficialPermitForManualSignature");
  });

  it("requires the analyst request before an electronic director signature", () => {
    expect(panel).toContain("directorRequestPending");
    expect(api).toContain("PERMIT_DIRECTOR_REQUEST_REQUIRED");
    expect(api).toContain("get_construction_permit_v1");
  });

  it("uses password reauthentication and exposes public QR verification after the official signature", () => {
    expect(panel).toContain("signProcessArtifactWithPassword");
    expect(panel).toContain('artifactType: "construction_permit"');
    expect(panel).toContain('artifactKey: "construction-permit"');
    expect(panel).toContain('type="password"');
    expect(panel).toContain("QRCodeSVG");
    expect(panel).toContain("directorVerificationUrl");
    expect(panel).toContain("Abrir verificação");
    expect(pdf).toContain("createQrCodeDataUrl");
    expect(pdf).toContain("buildPublicSignatureVerificationUrl");
    expect(pdf).toContain("VERIFICAR AUTENTICIDADE");
    expect(app).toContain('path="/verificar-assinatura"');
    expect(verificationPage).toContain("verify_process_artifact_signature_public_v1");
    expect(verificationMigration).toContain("security definer");
    expect(verificationMigration).toContain("'artifact_hash'");
    expect(verificationMigration).toContain("'signers'");
    expect(verificationMigration).not.toContain("'email'");
    expect(verificationMigration).not.toContain("'ip_address'");
  });

  it("keeps the secretary optional and only after the director", () => {
    expect(panel).toContain("Assinar também como Secretário");
    expect(api).toContain("PERMIT_DIRECTOR_SIGNATURE_REQUIRED");
    expect(pdf).toContain("const hasSecretary = secretaryOfficial;");
    expect(pdf).not.toContain("secretaryOfficial || showManual");
  });

  it("opens the native Alvara PDF without a visible preparation screen", () => {
    expect(pdf).toContain("prepareReservedPdfWindow");
    expect(pdf).not.toContain("Preparando o PDF oficial do Alvará...");
    expect(pdf).not.toContain("sigapro-pdf-progress");
    expect(pdf).toContain("opened.location.replace(url)");
  });

  it("generates a premium manual-signature version without printing workflow instructions", () => {
    expect(pdf).toContain("manualSignature");
    expect(pdf).toContain("showManualDirectorLine");
    expect(pdf).toContain("Diretor(a) Responsável");
    expect(pdf).not.toContain("ASSINATURA MANUAL");
    expect(pdf).not.toContain("ALVARÁ PREPARADO PARA ASSINATURA À CANETA");
  });

  it("highlights the permit type dynamically and keeps issuance status neutral", () => {
    expect(pdf).toContain("buildPermitDocumentTitle");
    expect(pdf).toContain("ALVARÁ DE DEMOLIÇÃO");
    expect(pdf).toContain("ALVARÁ DE REFORMA");
    expect(pdf).toContain("ALVARÁ DE AMPLIAÇÃO");
    expect(pdf).toContain("pdf.text(permitDocumentTitle, pageWidth / 2");
    expect(pdf).toContain('directorOfficial ? "EMITIDO" : "EM EMISSÃO"');
    expect(pdf).toContain('"ALVARÁ MUNICIPAL EMITIDO"');
    expect(pdf).not.toContain('"Aguardando assinatura da Diretoria"');
  });

  it("keeps municipality, property, regularization and technical data in the PDF", () => {
    expect(pdf).toContain("ALVARÁ DE CONSTRUÇÃO");
    expect(pdf).toContain("Identificação do processo, titular e imóvel");
    expect(pdf).toContain("Natureza da obra");
    expect(pdf).toContain("Edificação - regularização");
    expect(pdf).toContain("form?.propertyAddress");
    expect(pdf).toContain("form?.propertyRegistryNumber");
    expect(pdf).toContain("form?.technicalRegistration");
    expect(pdf).toContain("form?.technicalResponsibilityNumber");
    expect(pdf).toContain("form?.regularizationAreas");
  });

  it("never visually regresses a process after the official Alvara reached issuance", () => {
    expect(detail).toContain("const permitReachedIssuanceStage =");
    expect(detail).toContain('constructionPermit?.status !== "rascunho"');
    expect(detail).toContain("else if (permitReachedIssuanceStage)");
    expect(detail).toContain("currentFlowIndex = 4");
    expect(detail).toContain('"Alvará preparado para assinatura manual"');
    expect(detail).toContain("const effectiveSlaStage =");
    expect(detail).toContain("Alvará de Construção • assinatura manual");
  });

  it("keeps prerequisites visible before signature actions", () => {
    expect(panel).toContain("permitReadyForSignature");
    expect(panel).toContain("ISSQN / Projeto");
    expect(panel).toContain("Aprovação / Alvará");
    expect(panel).toContain("Pré-requisito técnico");
    expect(panel).toContain("Abrir e preencher Alvará");
    expect(detail).toContain('key: "alvara" as ProcessTab');
  });
});
