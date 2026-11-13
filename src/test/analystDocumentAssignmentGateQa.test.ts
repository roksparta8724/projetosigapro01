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
    expect(viewer).toContain("Marcadores organizam arquivos. As correções da planta são feitas no editor.");
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
  it("impede estouro de texto e botão no card de marcações",()=>{
    const viewer=read("src/pages/saas/DocumentViewerPage.tsx");
    expect(viewer).toContain('data-sigapro-document-info-sidebar="true"');
    expect(viewer).toContain('data-sigapro-analysis-error="true"');
    expect(viewer).toContain('data-sigapro-analysis-error-mobile="true"');
    expect(viewer).toContain('max-w-full overflow-hidden rounded-2xl');
    expect(viewer).toContain('min-w-0 flex-1 whitespace-normal break-words');
    expect(viewer).toContain('[overflow-wrap:anywhere]');
    expect(viewer).toContain('describeAnalysisStartError(actionError)');
    expect(viewer).toContain('Ir à fila de análise');
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
  it("corrige o gatilho de início de análise sem permitir UPDATE direto",()=>{
    const migration=read("neon/migrations/20261105_analyst_start_rpc_trigger_guard_v1.sql");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.start_process_analysis");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.guard_analysis_process_update");
    expect(migration).toContain("set_config('sigapro.analysis_start_process_id', _process_id::text, true)");
    expect(migration).toContain("set_config('sigapro.analysis_start_process_id', '', true)");
    expect(migration).toContain("coalesce(current_setting('sigapro.analysis_start_process_id', true),'') = OLD.id::text");
    expect(migration).toContain("AND NOT COALESCE((");
    expect(migration).toContain("NEW.analysis_assigned_to_profile_id = public.current_profile_id()");
    expect(migration).toContain("public.profile_operational_area(public.current_profile_id()) = 'analise'");
    expect(migration).toContain("public.process_technical_release_verified_v1(OLD.id)");
    expect(migration).toContain("NEW.municipality_id IS NOT DISTINCT FROM OLD.municipality_id");
    expect(migration).toContain("AND NOT public.can_write_process_analysis(OLD.id)");
    expect(migration).toContain("RAISE EXCEPTION 'Somente a equipe da Análise Urbanística");
    expect(migration).not.toContain("DISABLE TRIGGER");
  });
});
