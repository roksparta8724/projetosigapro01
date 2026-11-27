import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const code=(path:string)=>readFileSync(path,"utf8");

describe("SIGAPRO QA — leitura do projeto no próprio espaço de documentos",()=>{
  it("mostra o atalho exclusivamente no card Projeto Arquitetônico ao analista autorizado",()=>{
    const detail=code("src/pages/saas/ProcessDetailPage.tsx");
    expect(detail).toContain('data-sigapro-ai-review-shortcut="true"');
    expect(detail).toContain('document.label === "Projeto Arquitetônico"');
    expect(detail).toContain("canUseMunicipalChecklist &&");
    expect(detail).toContain("canEditAnalysisChecklist &&");
    expect(detail).toContain("stableAnalysisAccess");
    expect(detail).toContain('onClick={() => openDocumentWorkspace(document.id, true, true)}');
    expect(detail).toContain('data-primary-action="document"');
    expect(detail).toContain("SIGAPRO IA · Ler projeto");
    expect(detail).toContain("!text-white");
  });
  it("abre o PDF e a IA lado a lado, sem navegar para pré-conferência no primeiro clique",()=>{
    const detail=code("src/pages/saas/ProcessDetailPage.tsx");
    const editor=code("src/pages/saas/DocumentAnalysisPage.tsx");
    const precheck=code("src/components/platform/UrbanPrecheckPanel.tsx");
    expect(detail).toContain('"?ferramenta=navigate&painel=ia"');
    expect(editor).toContain('searchParams.get("painel") === "ia"');
    expect(editor).toContain('data-sigapro-project-reader-workspace="true"');
    expect(editor).toContain('documentId={document.id}');
    expect(editor).toContain("compact");
    expect(editor).toContain("activeMetrics={URBAN_METRICS.map");
    expect(editor).toContain("setShowProjectAi((current) => !current)");
    expect(precheck).not.toContain("<ArchitecturalPdfAiPanel");
    expect(precheck).toContain('id="sigapro-urban-precheck"');
    expect(precheck).toContain("Leitura do projeto: na pasta Documentos");
    const open=editor.slice(editor.indexOf("const openProjectAi ="),
      editor.indexOf("const sendReviewedDrawingToPrecheck ="));
    expect(open).not.toContain("navigate(");
    expect(open).not.toContain("fetch(");
  });
  it("encaminha apenas cotas confirmadas e vinculadas ao mesmo processo, PDF e município",()=>{
    const editor=code("src/pages/saas/DocumentAnalysisPage.tsx");
    const precheck=code("src/components/platform/UrbanPrecheckPanel.tsx");
    const panel=code("src/components/platform/ArchitecturalPdfAiPanel.tsx");
    expect(editor).toContain("createReviewedDrawingHandoff");
    expect(editor).toContain("sendReviewedDrawingToPrecheck");
    expect(editor).toContain('navigate(buildProcessPath(process, "analise") + "#sigapro-urban-precheck",');
    expect(precheck).toContain("readReviewedDrawingHandoff");
    expect(precheck).toContain("setLegalReviewConfirmed(false)");
    expect(precheck).toContain("{replace:true,state:null}");
    expect(panel).toContain("confirmedTransfer:true,readingMode");
    expect(panel).toContain("row.usableForReview && checked[row.metric]");
    expect(panel).toContain("Nenhuma medida");
    expect(panel).toContain("data-sigapro-ai-apply-reviewed");
  });
});
