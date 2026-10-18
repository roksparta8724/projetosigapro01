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
    expect(panel).toContain("Solicitar assinatura do Diretor");
    expect(panel).toContain("Assinar como Diretor");
    expect(panel).toContain("technicalSignature");
    expect(panel).toContain("directorSignature");
    expect(panel).toContain("new jsPDF");
    expect(panel).toContain("Gerar PDF oficial");
    expect(panel).toContain("Salvar rascunho");
  });

  it("places a public-verification QR inside both electronic signatures and the exported PDF", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");

    expect(panel).toContain("SignatureVerificationQr");
    expect(panel).toContain("buildPublicSignatureVerificationUrl");
    expect(panel).toContain("createQrCodeDataUrl");
    expect(panel).toContain('data-analysis-signature-qr="true"');
    expect(panel).toContain("technicalSignatureQrDataUrl");
    expect(panel).toContain("directorSignatureQrDataUrl");
    expect(panel).toContain('doc.text("QR DA ASSINATURA"');
    expect(panel).toContain('doc.text("ELETRÔNICA"');
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


describe("automatic physical withdrawal date", () => {
  it("uses the municipal clock automatically and does not ask the analyst to type a date", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const client = read("src/integrations/esign/artifactClient.ts");
    const migration = read("neon/migrations/20261018_withdrawal_automatic_date.sql");

    expect(panel).toContain("currentMunicipalDateValue");
    expect(panel).toContain('timeZone: "America/Sao_Paulo"');
    expect(panel).toContain("Automática");
    expect(panel).toContain('aria-readonly="true"');
    expect(panel).not.toContain('type="date"\n                  value={withdrawalDate}');
    expect(client).not.toContain("withdrawnAt: string");
    expect(migration).toContain("new.withdrawn_at := _official_date");
    expect(migration).toContain("new.withdrawn_at := old.withdrawn_at");
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


describe("selected checklist statuses unmistakable", () => {
  it("uses strong filled states and exposes aria-pressed for the selected option", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const polarity = read("src/styles/surface-polarity.css");

    expect(panel).toContain("aria-pressed={selected}");
    expect(panel).toContain('data-checklist-status={status}');
    expect(panel).toContain('data-premium-process-dark-header="analysis"');
    expect(panel).toContain('data-analysis-metric="blue"');
    expect(panel).toContain('data-analysis-dark-header="true"');
    expect(panel).toContain('data-analysis-signature-action="technical"');
    expect(panel).toContain("bg-emerald-600");
    expect(panel).toContain("bg-sky-600");
    expect(panel).toContain("bg-amber-600");

    expect(polarity).toContain("PROCESS DETAIL VISIBILITY LOCK V14");
    expect(polarity).toContain('button[data-checklist-status="A"][data-selected="true"]');
    expect(polarity).toContain('button[data-checklist-status="C"][data-selected="true"]');
  });
});


describe("V14/V15 process polarity authority", () => {
  it("forces blue analysis headers to white copy and keeps selected checklist values obvious", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const polarity = read("src/styles/surface-polarity.css");

    expect(panel).toContain('data-analysis-dark-header="true"');
    expect(panel).toContain("<CheckCircle2");
    expect(panel).toContain('data-analysis-section="true"');
    expect(panel).toContain('data-analysis-section-header="true"');

    expect(polarity).toContain("PROCESS DETAIL VISIBILITY LOCK V14");
    expect(polarity).toContain("PROCESS DETAIL ADAPTIVE CARDS V15");
    expect(polarity).toContain('[data-analysis-dark-header="true"]');
    expect(polarity).toContain('button[data-checklist-status="A"][data-selected="true"]');
    expect(polarity).toContain("color:#ffffff !important");
  });
});


describe("technical analysis legend contrast", () => {
  it("keeps every colored legend chip readable with white text in every theme", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const polarity = read("src/styles/surface-polarity.css");

    expect(panel).toContain('data-analysis-legend="true"');
    expect(panel).toContain('data-analysis-legend-chip="true"');
    expect(panel).toContain("data-analysis-legend-status={status}");
    expect(panel).toContain("sig-analysis-legend-text");

    expect(polarity).toContain(
      "ANALISE / FICHA TECNICA — LEGENDA DE STATUS V17",
    );
    expect(polarity).toContain(
      '[data-analysis-legend-chip="true"][data-analysis-legend-status="A"]',
    );
    expect(polarity).toContain(
      '[data-analysis-legend-chip="true"][data-analysis-legend-status="AP"]',
    );
    expect(polarity).toContain(
      '[data-analysis-legend-chip="true"][data-analysis-legend-status="C"]',
    );
    expect(polarity).toContain(
      '[data-analysis-legend-chip="true"][data-analysis-legend-status="NA"]',
    );
    expect(polarity).toContain("color:#ffffff !important");
    expect(polarity).toContain("-webkit-text-fill-color:#ffffff !important");
  });
});


describe("technical analysis typography sharpness", () => {
  it("compensates the 85 percent app zoom only inside the technical sheet cards and legend", () => {
    const panel = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    const polarity = read("src/styles/surface-polarity.css");

    expect(panel).toContain('data-analysis-crisp-card="true"');
    expect(panel).toContain("sig-analysis-crisp-label");
    expect(panel).toContain("sig-analysis-crisp-value");
    expect(panel).toContain("sig-analysis-crisp-help");
    expect(panel).toContain("sig-analysis-legend-text");

    expect(polarity).toContain("FICHA TECNICA — NITIDEZ TIPOGRAFICA V18");
    expect(polarity).toContain('html[data-page-zoom="85"]');
    expect(polarity).toContain("text-shadow:none !important");
    expect(polarity).toContain("filter:none !important");
    expect(polarity).toContain("font-size:12px !important");
  });
});
