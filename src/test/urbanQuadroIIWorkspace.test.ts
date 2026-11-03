import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("SIGAPRO IA — Quadro II safe assisted transcription", () => {
  it("indexes pages 38–51 without treating the index as transcribed rules", () => {
    const migration = read("neon/migrations/20261103_urban_quadro_ii_workspace_v1.sql");
    expect(migration).toContain("generate_series(38,51)");
    expect(migration).toContain("p=43");
    expect(migration).toContain("draft_unverified");
    expect(migration).toContain("'ready_for_ai',false");
    expect(migration).toContain("'legal_approval',false");
    expect(migration).not.toContain("activate_urban_regulation");
    expect(migration).not.toContain("DELETE FROM");
    expect(migration).toContain("is_urban_regulation_admin_v1");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ON CONFLICT (municipality_id,request_id) DO NOTHING");
  });

  it("never silently promotes imported categories to norms for the AI", () => {
    const client = read("src/integrations/backend/urbanPrecheckClient.ts");
    const panel = read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const settings = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    expect(client).toContain('"list_urban_quadro_ii_workspace_v1"');
    expect(client).toContain('"save_urban_quadro_ii_draft_entry_v1"');
    expect(client).toContain('_document_sha256: documentSha256');
    expect(panel).toContain('data-urban-quadro-ii="true"');
    expect(panel).toContain("Pendências do Quadro I permanecem isoladas");
    expect(panel).toContain("Nenhuma categoria transcrita nesta página");
    expect(panel).toContain('workspace?.status === "pending_legal_review"');
    expect(panel).toContain('disabled={!valid || saving}');
    expect(panel).toContain('crypto.randomUUID()');
    expect(panel).toContain("Conferi {selectedSuggestion?.source_pages?.length");
    expect(panel).toContain("sem validação jurídica");
    expect(settings).toContain("<UrbanLegalMatrixReviewPanel");
    expect(settings).toContain("<UrbanQuadroIIWorkspacePanel");
  });

  it("requires human provenance and leaves unknown parking and zoning fields blank", () => {
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    expect(client).toContain("entry.sourceExcerpt.trim().length < 20");
    expect(client).toContain("entry.pageNumber < 38 || entry.pageNumber > 51");
    expect(panel).toContain('permittedZones: ""');
    expect(panel).toContain('parkingRequirement: ""');
    expect(panel).toContain("Deixe vazio se não confirmado");
    expect(panel).toContain("Este registro ficará somente como rascunho");
  });
});


describe("SIGAPRO IA — Quadro I visible by default and Quadro II recoverable", () => {
  it("opens the Quadro I first and preserves an independent Quadro II tab", () => {
    const settings = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    const first = read("src/components/platform/UrbanLegalMatrixReviewPanel.tsx");
    const second = read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    expect(settings).toContain('useState<"I" | "II">("I")');
    expect(settings).toContain('setActiveQuadro("I")');
    expect(settings).toContain('role="group"');
    expect(settings).toContain('role="region"');
    expect(settings).toContain("Quadro I — Índices urbanísticos");
    expect(settings).toContain("Quadro II — Usos e localização");
    expect(settings).toContain("Cadastro jurídico de versões — etapa independente");
    expect(settings).not.toContain("Ver 23 registros");
    expect(settings).toContain('activeQuadro === "I" ?');
    expect(first).toContain('const firstActive = batchResult.value.find');
    expect(first).toContain('if (active && detail) setSelected(detail)');
    expect(first).toContain("Quadro I — matriz de limites e índices urbanísticos");
    expect(second).toContain("Tentar novamente");
    expect(second).toContain("PGRST202");
  });
});


describe("SIGAPRO IA — visual polarity for both Quadro tabs", () => {
  it("enforces selected navy/white and unselected white/dark under inverse-main mode", () => {
    const settings = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    const stylesheet = read("src/index.css");
    expect((settings.match(/data-urban-quadro-tab="true"/g) || []).length).toBe(2);
    expect((settings.match(/data-urban-quadro-tab-title="true"/g) || []).length).toBe(2);
    expect((settings.match(/data-urban-quadro-tab-detail="true"/g) || []).length).toBe(2);
    expect(settings).toContain('aria-pressed={activeQuadro === "I"}');
    expect(settings).toContain('aria-pressed={activeQuadro === "II"}');
    expect(settings).not.toContain("aria-selected=");
    expect(stylesheet).toContain("SIGAPRO IA — QUADROS I/II PREMIUM TAB CONTRAST");
    expect(stylesheet).toContain('button[data-urban-quadro-tab="true"][data-contrast-surface="dark"][aria-pressed="true"]');
    expect(stylesheet).toContain('button[data-urban-quadro-tab="true"][data-contrast-surface="light"][aria-pressed="false"]');
    expect(stylesheet).toContain("aria-pressed to avoid");
    expect(stylesheet).toContain("-webkit-text-fill-color: #ffffff !important;");
    expect(stylesheet).toContain("background: #0b3150 !important;");
    expect(stylesheet).toContain("background: #ffffff !important;");
    expect(stylesheet).toContain("color: #152b43 !important;");
  });
});


describe("SIGAPRO IA — Quadro II PDF evidence suggestions remain unverified", () => {
  it("loads only provenance-linked text and proposals without auto-activating rules", () => {
    const migration=read("neon/migrations/20261103_quadro_ii_source_evidence_qa_v1.sql");
    const seed=read("neon/qa-seeds/20261103_quadro_ii_pdf_evidence_qa.sql");
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.urban_quadro_ii_source_evidence_v1 FROM authenticated");
    expect(migration).toContain("'source_evidence_text'");
    expect(migration).toContain("'source_quality'");
    expect(migration).toContain("'proposals'");
    expect(seed).toContain("68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1");
    expect(seed).toContain("source_batch");
    expect(seed).toContain("ON CONFLICT (municipality_id,batch_id,page_number) DO NOTHING");
    expect(client).toContain('status: "proposal_unverified"');
    expect(panel).toContain("Pré-preencher e revisar");
    expect(panel).toContain('sourceExcerpt: (proposal.literal_source_excerpt || "").slice(0, 1600)');
    expect(panel).toContain("setSelectedSuggestion(proposal)");
    expect(panel).toContain("setConfirmed(false); // Auto-fill is never a human confirmation.");
    expect(panel).toContain('page.source_quality === "machine_unverified"');
    expect(panel).toContain("setConfirmed(false)");
    expect(panel).toContain("Texto extraído pode misturar colunas");
    expect(panel).toContain('page.source_quality === "visual_required"');
    expect(panel).toContain("Nenhuma sugestão é norma");
    expect(panel).toContain("Regras liberadas para IA");
    expect(panel).toContain('disabled={!valid || saving}');
  });
});


describe("SIGAPRO IA — assisted field auto-fill with legal safeguards", () => {
  it("prefills zoning, road, parking and source, but always requires manual evidence review", () => {
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    const seed=read("neon/qa-seeds/20261103_quadro_ii_autofill_candidates_qa.sql");
    expect(client).toContain("permitted_zones_text?: string");
    expect(client).toContain("source_pages?: number[]");
    expect(panel).toContain('permittedZones: (proposal.permitted_zones_text || "").slice(0, 600)');
    expect(panel).toContain('roadHierarchy: (proposal.road_hierarchy_text || "").slice(0, 600)');
    expect(panel).toContain('parkingRequirement: (proposal.parking_requirement_text || "").slice(0, 600)');
    expect(panel).toContain('specialConditions: (proposal.special_conditions_text || "").slice(0, 800)');
    expect(panel).toContain('sourceExcerpt: (proposal.literal_source_excerpt || "").slice(0, 1600)');
    expect(panel).toContain('setConfirmed(false); // Auto-fill is never a human confirmation.');
    expect(panel).toContain("selectedSuggestion.source_pages.join");
    expect(panel).toContain("Não aprove o cadastro apenas pela aparência");
    expect(panel).toContain('disabled={!valid || saving}');
    expect(seed).toContain("68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1");
    expect(seed).toContain("source_quality='machine_unverified'");
    expect(seed).not.toContain("activate_urban_regulation");
  });
});


describe("SIGAPRO IA — source-review form is visible and buttons maintain contrast", () => {
  it("renders prepared editor above category cards and scrolls to the chosen source", () => {
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const css=read("src/index.css");
    const editor=panel.indexOf('data-urban-qii-editor="true"');
    const proposals=panel.indexOf("Sugestões de categorias — requerem conferência");
    expect(editor).toBeGreaterThan(0);
    expect(editor).toBeLessThan(proposals);
    expect(panel).toContain("editorRef.current?.scrollIntoView");
    expect(panel).toContain('expanded ? "lg:col-span-2"');
    expect(panel).toContain('data-urban-qii-action="true"');
    expect(panel).toContain('data-urban-qii-action-label="true"');
    expect(panel).toContain("Pré-preencher e revisar");
    expect(panel).toContain("Conferência assistida · Página");
    expect(panel).toContain("setConfirmed(false); // Auto-fill is never a human confirmation.");
    expect(css).toContain('button[data-urban-qii-action="true"] > [data-urban-qii-action-label="true"]');
    expect(css).toContain("background: #0b3150 !important;");
    expect(css).toContain("-webkit-text-fill-color: #ffffff !important;");
  });
});


describe("SIGAPRO IA — safe literal evidence and E1 group applicability", () => {
  it("keeps E1 group scope and activities visible while rejecting composed excerpts as literal evidence", () => {
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    const client=read("src/integrations/backend/urbanPrecheckClient.ts");
    const seed=read("neon/qa-seeds/20261103_quadro_ii_e1_scope_and_evidence_qa.sql");
    expect(panel).toContain("Enquadramento geral da categoria:");
    expect(panel).toContain("Atividades abrangidas na fonte:");
    expect(panel).toContain('sourceExcerpt: (proposal.literal_source_excerpt || "").slice(0, 1600)');
    expect(panel).toContain("Resumos automáticos de várias colunas não são prova documental.");
    expect(client).toContain("literal_source_excerpt?: string;");
    expect(client).toContain("group_scope_text?: string;");
    expect(seed).toContain("área construída de até 250 m²");
    expect(seed).toContain("Creches; e similares.");
    expect(seed).toContain("document_sha256='68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1'");
    expect(seed).not.toContain("urban_regulation_versions");
  });
});
