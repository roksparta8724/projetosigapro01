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
    expect(analysis).toContain("grid-cols-[72px_minmax(0,1fr)_420px]");
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

  it("opens from the process in the same SPA view with the signed URL already prepared", () => {
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(viewer).not.toContain('target="_blank"');
    expect(viewer).not.toContain("Abrir original");
    expect(detail).not.toContain("window.open(");
    expect(detail).toContain("getSignedUrlForObjectStrict");
    expect(detail).toContain("documentAccessUrl");
    expect(detail).toContain("returnTo:");
    expect(analysis).toContain("prefetchedDocumentAccessUrl");
  });
});


describe("analyst document permission continuity", () => {
  it("keeps the annotation workspace tied to the Analysis role without stale queue ownership", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(analysis).toContain('session.role !== "prefeitura_admin"');
    expect(analysis).toContain('(session.role === "analista" && canAccessMunicipalArea(session, "analise"))');
    expect(analysis).not.toContain("isCurrentAnalysisOwner");
    expect(analysis).not.toContain("isProcessOwnedBySessionDepartment");

    expect(viewer).toContain('(session.role === "analista" && canAccessMunicipalArea(session, "analise"))');
    expect(viewer).not.toContain("isProcessOwnedBySessionDepartment");

    expect(detail).toContain('session.role !== "prefeitura_admin"');
    expect(detail).toContain('(session.role === "analista" && canAnalysisOperate)');
  });
});


describe("analyst PDF markup entry", () => {
  it("routes every authorized analyst straight into markup without a temporary browser tab", () => {
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(viewer).toContain("replaceAnalystViewerWithAnalysis");
    expect(viewer).toContain("analisar?ferramenta=highlight");
    expect(detail).toContain("openDocumentWorkspace");
    expect(detail).toContain("getSignedUrlForObjectStrict");
    expect(detail).toContain("navigate(");
    expect(detail).not.toContain("window.open(");
  });

  it("renders Nitro-like numbered highlights and visible text callouts on the PDF", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(analysis).toContain("Marcar área");
    expect(analysis).toContain("Adicionar texto");
    expect(analysis).toContain("Digite o apontamento no painel");
    expect(analysis).toContain("{annotation.note}");
    expect(analysis).toContain("{index + 1}");
    expect(analysis).toContain("Salvar rascunho");
    expect(analysis).toContain("Enviar apontamentos");
  });
});


describe("canonical analyst markup access", () => {
  it("uses the canonical Analysis operational area with legacy-role fallback", () => {
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const platform = read("src/lib/platform.ts");

    expect(viewer).toContain('session.role !== "prefeitura_admin"');
    expect(viewer).toContain('canAccessMunicipalArea(session, "analise")');
    expect(analysis).toContain('session.role !== "prefeitura_admin"');
    expect(analysis).toContain('canAccessMunicipalArea(session, "analise")');
    expect(detail).toContain('session.role !== "prefeitura_admin"');
    expect(detail).toContain("canAnalysisOperate");

    expect(platform).toContain("resolveSessionOperationalArea");
    expect(platform).toContain('if (session.role === "analista") return "analise"');
  });
});


describe("precise PDF annotation interaction", () => {
  it("uses a dedicated interaction layer so the native PDF plugin cannot steal marking gestures", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(analysis).toContain('data-annotation-capture-layer="true"');
    expect(analysis).toContain("event.preventDefault()");
    expect(analysis).toContain("event.stopPropagation()");
    expect(analysis).toContain("touch-none select-none");
  });

  it("auto-protects draft annotations and keeps the inspector inside its bounds", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    const css = read("src/index.css");

    expect(analysis).toContain("draftHydrated");
    expect(analysis).toContain("JSON.stringify({ annotations: draftAnnotations, savedAt })");
    expect(analysis).toContain('data-analysis-inspector="true"');
    expect(analysis).toContain("grid-cols-[72px_minmax(0,1fr)_420px]");
    expect(css).toContain("DOCUMENT ANALYSIS INSPECTOR: HARD OVERFLOW CONTRACT");
  });
});
