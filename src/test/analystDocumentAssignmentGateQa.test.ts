import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read=(name:string)=>readFileSync(name,"utf8");

describe("SIGAPRO QA — acesso à edição documental após atribuição",()=>{
  it("mantém acesso ao editor condicionado à permissão canAnalyzeProcessDocument",()=>{
    const viewer=read("src/pages/saas/DocumentViewerPage.tsx");
    const detail=read("src/pages/saas/ProcessDetailPage.tsx");
    const analysis=read("src/pages/saas/DocumentAnalysisPage.tsx");
    const permissions=read("src/lib/platform.ts");
    expect(viewer).toContain("canAnalyzeProcessDocument(session, process, effectiveScopeId)");
    expect(detail).toContain("canAnalyzeProcessDocument(session, process, effectiveScopeId)");
    expect(analysis).toContain("canAnalyzeProcessDocument(session, process, effectiveScopeId)");
    expect(permissions).toContain("return worksInAnalysis && isAssignedAnalyst");
    expect(permissions).toContain('if (session.role === "prefeitura_admin") return false');
  });
  it("explica bloqueio e encaminha à fila com ação oficial",()=>{
    const viewer=read("src/pages/saas/DocumentViewerPage.tsx");
    const detail=read("src/pages/saas/ProcessDetailPage.tsx");
    expect(viewer).toContain('data-sigapro-analyst-viewer-readonly="true"');
    expect(viewer).toContain("O processo chegou ao Urbanismo, mas ainda não foi assumido ou distribuído");
    expect(viewer).toContain("Adicionar marcador organiza o documento");
    expect(viewer).toContain('data-sigapro-go-analysis-assignment="true"');
    expect(detail).toContain('data-sigapro-document-editor-locked="true"');
    expect(detail).toContain('data-sigapro-open-analyst-assignment="true"');
    expect(viewer).toContain('navigate("/prefeitura/analise?secao=fila")');
    expect(detail).toContain('navigate("/prefeitura/analise?secao=fila")');
  });
  it("permite ao analista assumir diretamente do visualizador sem afrouxar o gate",()=>{
    const viewer=read("src/pages/saas/DocumentViewerPage.tsx");
    expect(viewer).toContain('data-sigapro-assume-analysis-in-viewer="true"');
    expect(viewer).toContain('data-sigapro-assume-analysis-in-viewer-aside="true"');
    expect(viewer).toContain('session.role === "analista"');
    expect(viewer).toContain('canAccessMunicipalArea(session, "analise")');
    expect(viewer).toContain("isProcessReleasedToUrbanAnalysis(process)");
    expect(viewer).toContain("!process.analysis?.assignedProfileId");
    expect(viewer).toContain("!process.analysis?.startedAt");
    expect(viewer).toContain("await startProcessAnalysis(process.id)");
    expect(viewer).toContain('ferramenta=highlight');
    expect(viewer).toContain("catch (actionError)");
  });
  it("mostra assumir análise na própria linha e usa workflow existente",()=>{
    const desk=read("src/pages/saas/AnalystDeskPage.tsx");
    expect(desk).toContain('data-sigapro-assume-analysis-direct="true"');
    expect(desk).toContain('session.role === "analista" &&');
    expect(desk).toContain('!hasAssignedAnalyst && !analysisStarted');
    expect(desk).toContain("onClick={() => void handleStartAnalysis(process)}");
    expect(desk).toContain('startProcessAnalysis(process.id)');
    expect(desk).toContain('assignProcessAnalysis({ processId: process.id, targetProfileId })');
    expect(desk).toContain("!text-white");
  });
});
