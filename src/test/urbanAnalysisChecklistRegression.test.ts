import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("urban analysis checklist", () => {
  it("keeps the photographed municipal checklist structure in the analyst process", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(panel).toContain("Requerimento");
    expect(panel).toContain("ART / RRT");
    expect(panel).toContain("Índices urbanísticos");
    expect(panel).toContain("Taxas de aprovação");
    expect(panel).toContain("Aprovações externas");
    expect(panel).toContain("Bombeiro / Declaração de combate a incêndio");
    expect(panel).toContain("VISA — Vigilância Sanitária");
    expect(detail).toContain("<UrbanAnalysisChecklistPanel");
  });

  it("shares one municipal draft per process, uses dual signatures and exports PDF", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");

    expect(panel).toContain("sigapro:urban-analysis-checklist:v2");
    expect(panel).toContain("municipalityId");
    expect(panel).toContain("Salvar rascunho");
    expect(panel).toContain("Assinar análise técnica");
    expect(panel).toContain("Assinar conferência fiscal");
    expect(panel).toContain("technicalSignature");
    expect(panel).toContain("fiscalSignature");
    expect(panel).toContain("new jsPDF");
    expect(panel).toContain("Gerar PDF final");
    expect(panel).toContain("RASCUNHO");
  });

  it("supports A, AP, C and N/A with observations and routing", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");

    expect(panel).toContain('label: "De acordo"');
    expect(panel).toContain('label: "Apresentar"');
    expect(panel).toContain('label: "Corrigir"');
    expect(panel).toContain('label: "Não se aplica"');
    expect(panel).toContain("Observação do analista");
    expect(panel).toContain("Encaminhamento após análise");
    expect(panel).toContain("Expediente");
    expect(panel).toContain("Topografia");
  });
});


describe("official municipal analysis sheet header", () => {
  it("uses the official municipality header and process identity", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(panel).toContain("Caderno técnico digital");
    expect(panel).toContain("Ficha Oficial de Análise do Processo");
    expect(panel).toContain("municipalityLogoUrl");
    expect(panel).toContain("secretariat");
    expect(panel).toContain("directorate");
    expect(panel).toContain("Requerente / proprietário");
    expect(detail).toContain("municipalityLogoUrl=");
    expect(detail).toContain("canUseMunicipalChecklist");
  });
});
