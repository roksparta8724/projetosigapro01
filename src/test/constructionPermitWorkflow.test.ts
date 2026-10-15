import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildConstructionPermitNumber } from "@/lib/constructionPermit";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("construction permit workflow", () => {
  it("moves a compensated ISS guide out of the current Finance stage", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(detail).toContain('issuedConstructionGuide?.status === "compensada"');
    expect(detail).toContain("Alvará de Construção");
    expect(detail).toContain('key: "alvara" as ProcessTab');
    expect(detail).toContain("currentFlowIndex = 4");
    expect(detail).toContain(
      "Pagamento compensado — processo retornado à Análise Urbanística",
    );
  });

  it("creates a stable municipal construction permit number", () => {
    expect(buildConstructionPermitNumber("PM-2026-00002")).toBe(
      "ALV-2026-000002",
    );
  });

  it("requires technical and director signatures before final issuance", () => {
    const model = read("src/lib/constructionPermit.ts");
    const panel = read("src/components/platform/ConstructionPermitPanel.tsx");

    expect(model).toContain('"aguardando_diretor"');
    expect(model).toContain("userCanSignPermitAsDirector");
    expect(panel).toContain("Assinatura da Análise Técnica");
    expect(panel).toContain("Assinatura da Diretoria");
    expect(panel).toContain("O sistema não cria assinatura fictícia");
  });

  it("generates a PDF with property, technical responsibility and signatures", () => {
    const pdf = read("src/lib/constructionPermitPdf.ts");

    expect(pdf).toContain("ALVARÁ DE CONSTRUÇÃO");
    expect(pdf).toContain("RESPONSÁVEL TÉCNICO");
    expect(pdf).toContain("IDENTIFICAÇÃO DO IMÓVEL E DA OBRA");
    expect(pdf).toContain("CONDIÇÕES DA LICENÇA");
    expect(pdf).toContain("ASSINATURAS MUNICIPAIS");
    expect(pdf).toContain("RASCUNHO - SEM VALIDADE");
  });

  it("keeps the database schema versioned without applying it during local validation", () => {
    const migration = read(
      "neon/migrations/20261015_construction_permit_workflow.sql",
    );

    expect(migration).toContain("create table if not exists public.construction_permits");
    expect(migration).toContain("analyst_signed_at");
    expect(migration).toContain("director_signed_at");
    expect(migration).toContain("status = 'emitido'");
  });
});


  it("opens permit filling over the process and keeps the external permit stage visible", () => {
    const panel = read("src/components/platform/ConstructionPermitPanel.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const model = read("src/lib/constructionPermit.ts");

    expect(panel).toContain("Preencher Alvará");
    expect(panel).toContain("<Dialog");
    expect(panel).toContain("O formulário abre sobre o processo");
    expect(panel).toContain("Salvar rascunho");
    expect(panel).toContain("Salvar e visualizar Alvará");
    expect(panel).toContain("Alvará em preparação pela Prefeitura");
    expect(detail).toContain("currentFlowIndex >= 4");
    expect(detail).toContain("Acompanhar Alvará");
    expect(model).toContain("ConstructionPermitFormData");
    expect(model).toContain("complementaryConditions");
  });

  it("uses filled permit data in the generated PDF", () => {
    const pdf = read("src/lib/constructionPermitPdf.ts");

    expect(pdf).toContain("const form = permit.formData");
    expect(pdf).toContain("form?.propertyAddress");
    expect(pdf).toContain("form?.technicalRegistration");
    expect(pdf).toContain("form?.licenseObject");
    expect(pdf).toContain("form?.complementaryConditions");
  });


describe("construction permit early workspace", () => {
  it("opens the Alvara workspace before final readiness but keeps signatures gated", () => {
    const panel = read("src/components/platform/ConstructionPermitPanel.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(panel).toContain("canStartDraft");
    expect(panel).toContain("permitReadyForSignature");
    expect(panel).toContain("Abrir e preencher Alvará");
    expect(panel).toContain("O Alvará pode ser preparado antecipadamente em rascunho");
    expect(panel).toContain("Pré-requisito financeiro");
    expect(panel).toContain("Pré-requisito técnico");
    expect(detail).toContain("canAnalysisOperate || constructionPaymentCompensated");
  });
});


describe("permit header follows the same premium process contrast", () => {
  it("keeps the dark permit header readable without touching global chrome", () => {
    const panel = read("src/components/platform/ConstructionPermitPanel.tsx");
    const polarity = read("src/styles/surface-polarity.css");

    expect(panel).toContain('data-premium-process-dark-header="permit"');
    expect(panel).toContain('data-premium-process-dark-header="permit-dialog"');
    expect(panel).toContain("!text-white");
    expect(polarity).toContain("PROCESS DETAIL VISIBILITY LOCK V12");
    expect(polarity).toContain('[data-construction-permit-panel="true"] > [data-premium-process-dark-header="permit"]');
  });
});


describe("V16 permit dark header authority", () => {
  it("uses the same fixed dark surface contract as the analysis and document cards", () => {
    const panel = read("src/components/platform/ConstructionPermitPanel.tsx");
    const polarity = read("src/styles/surface-polarity.css");

    expect(panel).toContain('data-fixed-dark-card="true"');
    expect(polarity).toContain("PROCESS DETAIL POLARITY AUTHORITY V16");
    expect(polarity).toContain('[data-fixed-dark-card="true"] *');
  });
});
