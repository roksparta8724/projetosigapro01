// SIGAPRO_FORMAL_DOCUMENT_AUDIT_LOCAL_V2
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canAnalyzeProcessDocument, canViewMunicipalProcessDocument, type SessionUser, type ProcessRecord } from "@/lib/platform";
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const municipalityId = "campo-limpo-paulista-test";
const analyst = { id: "author", name: "Analista responsável", municipalityId, tenantId: municipalityId, role: "analista", department: "Urbanismo e Obras", accessLevel: 1, email: "author@prefeitura.test", title: "Analista", userType: "Interno", accountStatus: "active" } as SessionUser;
const closed = { id: "p", municipalityId, tenantId: municipalityId, processControl: { currentFolder: "Vistoria" }, status: "vistoria", dispatches: [], payment: { guides: [] }, analysis: { assignedProfileId: "author", assignedTo: "Analista responsável" } } as unknown as ProcessRecord;
describe("SIGAPRO documentos oficiais e auditoria", () => {
  it("outro analista pode consultar sem editar", () => {
    const other = { ...analyst, id: "another", name: "Outro Analista" };
    expect(canViewMunicipalProcessDocument(other, closed, municipalityId)).toBe(true);
    expect(canAnalyzeProcessDocument(other, closed, municipalityId)).toBe(false);
  });
  it("nao transfere acesso de leitura entre prefeituras", () => {
    expect(canViewMunicipalProcessDocument({ ...analyst, municipalityId: "outro", tenantId: "outro" }, closed, municipalityId)).toBe(false);
  });
  it("roteia leitura para visualizador e nao para mesa de edicao", () => {
    const source = read("src/pages/saas/ProcessDetailPage.tsx");
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    expect(source).toContain("SIGAPRO_DOCUMENT_ROUTING_READONLY_V2");
    expect(analysis).toContain("SIGAPRO_ANALYSIS_ROUTE_READONLY_REDIRECT_V2");
    expect(analysis).toContain('"/visualizar"');
  });
  it("exibe documentos em ordem e mostra PDF somente quando arquivado", () => {
    const source = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    expect(source).toContain("SIGAPRO_FORMAL_DOCUMENT_AUDIT_LOCAL_V2");
    expect(source).toContain("left.artifact_version - right.artifact_version");
    expect(source).toContain('data-formal-analysis-document="true"');
    expect(source).toContain("PDF pendente de juntada");
    expect(source).toContain("Abrir PDF arquivado");
  });
  it("mostra identidade e horario somente para eventos auditados", () => {
    const source = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    expect(source).toContain('data-analysis-audit-trail="true"');
    expect(source).toContain("entry.actorProfileId");
    expect(source).toContain('entry.at || "Data e hora não registradas"');
  });
});
