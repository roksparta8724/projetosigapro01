import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildConstructionPermitNumber } from "@/lib/constructionPermit";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("construction permit workflow", () => {
  const panel = read("src/components/platform/ConstructionPermitPanel.tsx");
  const pdf = read("src/lib/constructionPermitPdf.ts");
  const api = read("api/e-sign-artifact.ts");
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
    expect(panel).toContain("Gerar PDF para assinatura à caneta");
  });

  it("offers the two director signature paths before PDF completion", () => {
    expect(panel).toContain("Enviar ao Diretor para assinar eletronicamente");
    expect(panel).toContain("Gerar PDF para assinatura à caneta");
    expect(panel).toContain("requestOfficialPermitDirectorSignature");
    expect(panel).toContain("markOfficialPermitForManualSignature");
  });

  it("requires the analyst request before an electronic director signature", () => {
    expect(panel).toContain("directorRequestPending");
    expect(api).toContain("PERMIT_DIRECTOR_REQUEST_REQUIRED");
    expect(api).toContain("get_construction_permit_v1");
  });

  it("keeps the secretary optional and only after the director", () => {
    expect(panel).toContain("Assinar também como Secretário");
    expect(api).toContain("PERMIT_DIRECTOR_SIGNATURE_REQUIRED");
    expect(pdf).toContain("const hasSecretary = secretaryOfficial");
  });

  it("generates a premium manual-signature version when chosen", () => {
    expect(pdf).toContain("manualSignature");
    expect(pdf).toContain("ASSINATURA MANUAL");
    expect(pdf).toContain("Assinatura da autoridade municipal");
    expect(pdf).toContain("ALVARÁ PREPARADO PARA ASSINATURA À CANETA");
  });

  it("keeps municipality, property and technical data in the PDF", () => {
    expect(pdf).toContain("ALVARÁ DE CONSTRUÇÃO");
    expect(pdf).toContain("Titular e responsável técnico");
    expect(pdf).toContain("Imóvel e obra");
    expect(pdf).toContain("Objeto e condições do Alvará");
    expect(pdf).toContain("form?.propertyAddress");
    expect(pdf).toContain("form?.technicalRegistration");
    expect(pdf).toContain("form?.licenseObject");
  });

  it("keeps prerequisites visible before signature actions", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(panel).toContain("permitReadyForSignature");
    expect(panel).toContain("Pré-requisito financeiro");
    expect(panel).toContain("Pré-requisito técnico");
    expect(panel).toContain("Abrir e preencher Alvará");
    expect(detail).toContain('key: "alvara" as ProcessTab');
  });
});
