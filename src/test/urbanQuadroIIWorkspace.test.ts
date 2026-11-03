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
    expect(panel).toContain("CA mínimo da AIU(2) permanece pendente");
    expect(panel).toContain("Nenhuma categoria transcrita nesta página");
    expect(panel).toContain('workspace?.status === "pending_legal_review"');
    expect(panel).toContain('disabled={!valid || saving}');
    expect(panel).toContain('crypto.randomUUID()');
    expect(panel).toContain("Conferi a página");
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
    expect(panel).toContain("Este registro ficará apenas como rascunho");
  });
});
