import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("premium process surface contract", () => {
  it("keeps fixed dark cards light-on-dark without touching topbar chrome", () => {
    const css = read("src/index.css");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(detail).toContain('data-surface="fixed-dark"');
    expect(css).toContain("SIGAPRO SURFACE CONTRAST V2");
    expect(css).toContain('[data-surface="fixed-dark"] :is(');
    expect(css).toContain("h1,h2,h3,h4,h5,h6,p,span,strong,small,label,div,a");
    expect(css).toContain("color: #f8fbff !important");
    expect(css).not.toContain('.sig-premium-topbar [data-surface="fixed-dark"]');
  });

  it("keeps semantic document KPI cards readable in light and inverse themes", () => {
    const css = read("src/index.css");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(detail).toContain('data-surface="semantic-card" data-tone="emerald"');
    expect(detail).toContain('data-surface="semantic-card" data-tone="amber"');
    expect(detail).toContain('data-surface="semantic-card" data-tone="sky"');
    expect(detail).toContain('data-surface="semantic-card" data-tone="neutral"');
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell [data-surface="semantic-card"]');
    expect(css).toContain("background: linear-gradient(145deg,#0b3d33");
  });

  it("propagates the same contrast contract to process list cards", () => {
    const css = read("src/index.css");
    const analysis = read("src/pages/saas/AnalystDeskPage.tsx");

    expect(css).toContain('[data-process-premium-card="true"]');
    expect(analysis).toContain('data-process-premium-card="true"');
    expect(analysis).toContain('data-primary-action="process"');
    expect(analysis).toContain("h-14 w-full");
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
