import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("document workspace continuity", () => {
  it("never paints the old light process background before a document tab boots", () => {
    const html = read("index.html");
    const permission = read("src/components/platform/PermissionRoute.tsx");

    expect(html).toContain('var isFullDocumentRoute =');
    expect(html).toContain('initialBackground = isFullDocumentRoute ? "#dfe5ec"');
    expect(html).toContain('data-sigapro-document-preboot="true"');
    expect(permission).toContain("<DocumentWorkspaceBoot");
    expect(permission).toContain('mode={documentRoute[1] === "analisar" ? "analysis" : "viewer"}');
  });

  it("keeps the real viewer mounted as the data and signed URL resolve", () => {
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");

    expect(viewer).toContain("platformDataLoading || !dataReadyForCurrentUser");
    expect(viewer).toContain('<DocumentWorkspaceBoot mode="viewer" />');
    expect(viewer).toContain("Visualizador documental");
    expect(viewer).toContain("Analisar / marcar PDF");
    expect(viewer).toContain("canAnalyzeDocument");
    expect(viewer).not.toContain("Carregando documento com acesso seguro...");
  });
});

describe("premium PDF analysis workspace", () => {
  it("uses an editor-style toolbar, annotation rail and technical inspector", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(analysis).toContain("Mesa de análise documental");
    expect(analysis).toContain("Ferramenta ativa");
    expect(analysis).toContain("Painel técnico");
    expect(analysis).toContain("Marcar área");
    expect(analysis).toContain("Adicionar texto");
    expect(analysis).toContain("Arraste sobre o ponto incorreto para destacar a área");
    expect(analysis).toContain("Clique no ponto exato do documento para fixar um texto numerado");
    expect(analysis).toContain("Anotações · página");
    expect(analysis).toContain("Resultado da análise");
    expect(analysis).toContain("grid-cols-[72px_minmax(0,1fr)_380px]");
  });

  it("keeps page-specific annotations and review actions in the same workspace", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(analysis).toContain("pageAnnotations.map");
    expect(analysis).toContain("saveAnnotation");
    expect(analysis).toContain("approveDocument");
    expect(analysis).toContain("sendDraftToProfessional");
    expect(analysis).toContain("Voltar ao processo");
  });
});


describe("viewer annotation entry", () => {
  it("opens annotation tools directly from the viewer for authorized analysts", () => {
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(viewer).toContain('openAnalysisWorkspace("highlight")');
    expect(viewer).toContain('openAnalysisWorkspace("text")');
    expect(viewer).toContain("Marca-texto");
    expect(viewer).toContain("Adicionar texto");
    expect(analysis).toContain('searchParams.get("ferramenta")');
  });
});


describe("annotation draft and professional handoff", () => {
  it("keeps annotations private until the analyst sends the draft", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(analysis).toContain("reviewDraftStorageKey");
    expect(analysis).toContain("Salvar rascunho");
    expect(analysis).toContain("Nada foi enviado ao profissional");
    expect(analysis).toContain("Enviar apontamentos");
    expect(analysis).toContain("sendDraftToProfessional");
    expect(analysis).toContain('visibility: "misto"');
    expect(analysis).toContain('"rejeitado"');
  });

  it("does not open an extra original-document tab from the viewer", () => {
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(viewer).not.toContain('target="_blank"');
    expect(viewer).not.toContain("Abrir original");
    expect((detail.match(/window\\.open\\(/g) || []).length).toBe(1);
    expect(detail).toContain("openDocumentWorkspace");
  });
});
