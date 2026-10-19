import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("premium process surface contract", () => {
  it("keeps fixed dark cards light-on-dark without touching topbar chrome", () => {
    const polarity = read("src/styles/surface-polarity.css");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const finalStart = polarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14");
    const finalBlock = polarity.slice(finalStart);

    expect(detail).toContain('data-surface="fixed-dark"');
    expect(finalStart).toBeGreaterThanOrEqual(0);
    expect(finalBlock).toContain("#sig-process-document-command-center");
    expect(finalBlock).toMatch(/color:\s*#ffffff\s*!important/);
    expect(finalBlock).not.toContain(".sig-premium-topbar");
    expect(finalBlock).not.toContain(".sig-sidebar-shell");
  });

  it("keeps semantic document KPI cards readable in light and inverse themes", () => {
    const polarity = read("src/styles/surface-polarity.css");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(detail).toContain('data-surface="semantic-card" data-tone="emerald"');
    expect(detail).toContain('data-surface="semantic-card" data-tone="amber"');
    expect(detail).toContain('data-surface="semantic-card" data-tone="sky"');
    expect(detail).toContain('data-surface="semantic-card" data-tone="neutral"');
    expect(polarity).toContain('[data-surface="semantic-card"]');
    expect(polarity).toContain('[data-layout-mode="inverse-main"]');
    expect(polarity).toContain("background: linear-gradient(145deg,#0b4537 0%,#08745a 100%)");
  });

  it("propagates the same contrast contract to process list cards", () => {
    const polarity = read("src/styles/surface-polarity.css");
    const analysis = read("src/pages/saas/AnalystDeskPage.tsx");

    expect(polarity).toContain('[data-process-premium-card="true"]');
    expect(analysis).toContain('data-process-premium-card="true"');
    expect(analysis).toContain('data-primary-action="process"');
    expect(analysis).toContain('data-primary-action="process"');
    expect(analysis).toContain("Abrir processo");
  });
});

describe("premium PDF review workflow", () => {
  it("opens analyst documents into a visible annotation workspace", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(detail).toContain('?ferramenta=highlight');
    expect(detail).toContain("Abrir documento e analisar");
    expect(viewer).toContain("replaceAnalystViewerWithAnalysis");
    expect(analysis).toContain('data-analysis-toolbar="true"');
    expect(analysis).toContain("Marcar área");
    expect(analysis).toContain("Adicionar texto");
  });

  it("keeps annotations in draft until explicit send to the professional", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(analysis).toContain("Salvar rascunho");
    expect(analysis).toContain("Enviar apontamentos");
    expect(analysis).toContain("draftAnnotations");
    expect(analysis).toContain("sendDraftToProfessional");
    expect(analysis).toContain('visibility: "misto"');
  });
});
