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

  it("força branco no texto e no ícone do botão IA apesar das regras globais dos cards", () => {
    const detail=read("src/pages/saas/ProcessDetailPage.tsx");
    const css=read("src/styles/surface-polarity.css");
    const anchor=detail.indexOf('data-sigapro-ai-review-shortcut="true"');
    const end=detail.indexOf("</button>",anchor);
    const button=detail.slice(anchor,end);
    const key="SIGAPRO IA PROJECT SHORTCUT CONTRAST LOCK V1";
    const start=css.lastIndexOf("/* "+key);
    expect(anchor).toBeGreaterThan(0);
    expect(button).toContain('data-primary-action="document"');
    expect(button).toContain('sig-primary-document-action');
    expect(button).toContain('data-sigapro-ai-review-icon="true"');
    expect(button).toContain('data-sigapro-ai-review-label="true"');
    expect(button).toContain("SIGAPRO IA · Ler projeto");
    expect(start).toBeGreaterThan(0);
    const rule=css.slice(start);
    expect(rule).toContain('[data-process-document-card="true"][data-surface="adaptive-card"][data-force-card-contrast="adaptive"]');
    expect(rule).toContain('button.sig-primary-document-action[data-sigapro-ai-review-shortcut="true"]');
    expect(rule).toContain('[data-sigapro-ai-review-label="true"]');
    expect(rule).toContain('[data-sigapro-ai-review-icon="true"]');
    expect(rule).toContain('color: #ffffff !important;');
    expect(rule).toContain('-webkit-text-fill-color: #ffffff !important;');
    expect(rule).toContain('stroke: currentColor !important;');
    // A regra especifica vem depois das regras de cores adaptativas por tema.
    expect(start).toBeGreaterThan(css.indexOf('PRIMARY PROCESS/DOCUMENT ACTIONS'));
    expect(rule).not.toContain(".sig-premium-topbar");
    expect(rule).not.toContain(".sig-sidebar-shell");
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
