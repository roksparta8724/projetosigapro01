import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("process document tab theme continuity", () => {
  it("uses the actual SIGAPRO layout mode so inverse themes never expose a white document body", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const css = read("src/index.css");

    expect(detail).toContain('data-process-document-workspace="true"');
    expect(detail).toContain('data-process-document-content="true"');
    expect(detail).toContain('data-process-document-alert="pending"');
    expect(detail).toContain('data-process-document-review-strip="true"');
    expect(css).toContain("PROCESS DOCUMENT WORKSPACE THEME CONTRACT V1");
    expect(css).toContain('[data-layout-mode="inverse-main"]');
    expect(css).toContain('[data-process-document-content="true"]');
    expect(css).toContain("linear-gradient(180deg,#0a1b2a 0%,#081521 100%)");
  });
});

describe("document workspace continuity", () => {
  it("never paints the old light process background before a document tab boots", () => {
    const html = read("index.html");
    const permission = read("src/components/platform/PermissionRoute.tsx");

    expect(html).toContain('var isFullDocumentRoute =');
    expect(html).toContain('initialBackground = isFullDocumentRoute ? "#2b3037"');
    expect(html).not.toContain('data-sigapro-document-preboot="true"');
    expect(permission).toContain('data-document-route-preboot="silent"');
    expect(permission).toContain('className="min-h-screen bg-[#2b3037]"');
    expect(permission).not.toContain("<DocumentWorkspaceBoot");
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

describe("audited document reanalysis", () => {
  it("lets the Analysis unit reopen an approved document without erasing audit history", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    const data = read("src/hooks/usePlatformData.tsx");
    const backend = read("src/integrations/backend/platformImpl.ts");
    const migration = read("neon/migrations/20261018_document_analysis_reopen.sql");

    expect(analysis).toContain("Reabrir para nova análise");
    expect(analysis).toContain("Confirmar reabertura");
    expect(analysis).toContain("reopenProcessDocumentAnalysis");
    expect(data).toContain("reopenProcessDocumentAnalysis");
    expect(backend).toContain("reopen_process_document_analysis_v1");
    expect(migration).toContain("Análise documental reaberta");
    expect(migration).toContain("review_status='pendente'");
    expect(migration).toContain("Motivo:");
  });
});


describe("direct PDF workspace opening", () => {
  it("prefetches the signed URL and removes the fake white-sheet loading stage", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const handoff = read("src/lib/documentWorkspaceAccess.ts");

    expect(detail).toContain("getSignedUrlForObjectStrict");
    expect(detail).toContain("cacheDocumentWorkspaceAccessUrl");
    expect(detail).toContain('window.open(workspaceUrl, "sigapro-document-workspace")');
        expect(analysis).toContain("consumeDocumentWorkspaceAccessUrl");
    expect(viewer).toContain("consumeDocumentWorkspaceAccessUrl");
    expect(analysis).toContain('data-document-loading-surface="silent"');
    expect(viewer).toContain('data-document-loading-surface="silent"');
    expect(analysis).not.toContain("DocumentWorkspaceBoot");
    expect(viewer).not.toContain("DocumentWorkspaceBoot");
    expect(detail).not.toContain('window.open("about:blank", "sigapro-document-workspace")');
    expect(analysis).not.toContain("animate-pulse rounded-full bg-slate-200");
    expect(viewer).not.toContain("animate-pulse rounded-full bg-slate-200");
    expect(handoff).toContain("DOCUMENT_WORKSPACE_ACCESS_TTL_MS");
    expect(handoff).toContain("window.localStorage.removeItem(key)");
  });
});


describe("premium PDF analysis workspace", () => {
  it("uses an editor-style toolbar, annotation rail and technical inspector", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

    expect(analysis).toContain("Mesa de análise documental");
    expect(analysis).toContain("Ferramenta ativa");
    expect(analysis).toContain("Painel técnico");
    expect(analysis).toContain('data-pdf-annotation-toolbar="true"');
    expect(analysis).toContain("Marca-texto / Marcar área");
    expect(analysis).toContain("Adicionar texto / apontamento");
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

  it("opens the document in exactly one dedicated browser tab", () => {
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(viewer).not.toContain('target="_blank"');
    expect(viewer).not.toContain("Abrir original");
    expect((detail.match(/window\.open\(/g) || []).length).toBe(1);
    expect(detail).toContain('window.open(workspaceUrl, "sigapro-document-workspace")');
    expect(detail).toContain("cacheDocumentWorkspaceAccessUrl");
    expect(detail).toContain("getSignedUrlForObjectStrict");
    expect(detail).toContain("openedTab.opener = null");
        expect(detail).toContain("openedTab.focus()");
  });
});


describe("analyst document permission continuity", () => {
  it("uses one canonical permission helper in process, viewer and analyzer", () => {
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(analysis).toContain("canAnalyzeProcessDocument(session, process, effectiveScopeId)");
    expect(viewer).toContain("canAnalyzeProcessDocument(session, process, effectiveScopeId)");
    expect(detail).toContain("canAnalyzeProcessDocument(session, process, effectiveScopeId)");

    expect(analysis).not.toContain("isProcessOwnedBySessionDepartment");
    expect(viewer).not.toContain("isProcessOwnedBySessionDepartment");
  });
});


describe("analyst PDF markup entry", () => {
  it("routes every authorized analyst straight into markup in one maximized tab", () => {
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(viewer).toContain("replaceAnalystViewerWithAnalysis");
    expect(viewer).toContain("analisar?ferramenta=highlight");
    expect(detail).toContain("openDocumentWorkspace");
    expect(detail).toContain('const route = shouldAnalyze ? "analisar" : "visualizar"');
    expect(detail).toContain('const query = shouldAnalyze ? "?ferramenta=highlight" : ""');
    expect(detail).toContain('window.open(workspaceUrl, "sigapro-document-workspace")');
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
  it("keeps technical document work shared across the Analysis unit while the process is in Analysis", () => {
    const platform = read("src/lib/platform.ts");

    expect(platform).toContain("export function canAnalyzeProcessDocument");
    expect(platform).toContain('if (session.role === "prefeitura_admin") return false');
    expect(platform).toContain('canAccessMunicipalArea(session, "analise")');
    expect(platform).toContain("isProcessOwnedBySessionDepartment(session, process)");
    expect(platform).toContain('if (session.role === "analista")');
    expect(platform).toContain("return worksInAnalysis");
    expect(platform).not.toContain("return assignedProfileId === session.id");
  });

  it("derives document scope from the process before transient UI municipality state", () => {
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    for (const source of [viewer, analysis, detail]) {
      expect(source).toContain("process?.municipalityId");
      expect(source).toContain("process?.tenantId");
    }
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
