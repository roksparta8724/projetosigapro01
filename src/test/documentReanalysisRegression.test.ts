import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = read("src/pages/saas/DocumentAnalysisPage.tsx");
const store = read("src/hooks/usePlatformData.tsx");
const migration = read("neon/migrations/20261018_document_analysis_reopen.sql");

describe("audited document reanalysis", () => {
  it("shows a professional reopen action below an approved document", () => {
    expect(page).toContain("Reabrir para nova análise");
    expect(page).toContain("Reabertura auditada");
    expect(page).toContain("Confirmar reabertura");
    expect(page).toContain("A aprovação anterior não será apagada");
    expect(page).toContain('searchParams.get("reabrir") === "1"');
    expect(page).toContain("!isSignedAnalysisArchiveDocument(document)");
    expect(page).toContain("!canUseAnalysis || busy");
  });

  it("requires a reason and returns the document to pending without deleting history", () => {
    expect(store).toContain("reopenProcessDocumentAnalysis");
    expect(migration).toContain("review_status='pendente'");
    expect(migration).toContain("Análise documental reaberta");
    expect(migration).toContain("Decisão anterior:");
    expect(migration).toContain("Informe o motivo da reabertura da análise");
  });

  it("keeps the correction restricted to the Analysis technical workspace", () => {
    expect(migration).toContain("public.can_write_process_analysis(_process_id)");
    expect(migration).toContain("Somente a equipe da Análise Urbanística pode reabrir esta análise.");
  });
});

describe("append-only document evaluations and official process reopening", () => {
  it("associates the official audit with the exact document and preserves chronological history", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const backend = read("src/integrations/backend/platformImpl.ts");
    const registry = read("src/pages/saas/MunicipalProcessRegistryPage.tsx");
    const migration = read("neon/migrations/20261124_document_evaluation_history_and_process_reopen.sql");
    expect(detail).toContain('data-document-evaluation-history="true"');
    expect(detail).toContain("getDocumentReviewHistory(process, document.id)");
    expect(backend).toContain("documentId:");
    expect(migration).toContain("'[documento:'||_document_id::text||'] '");
    expect(migration).toContain("Autor anterior:");
    expect(migration).toContain("public.reopen_process(_process_id,btrim(_reason))");
    expect(registry).toContain("canReopenProcessForReview(session, latest, effectiveScopeId)");
    expect(registry).toContain("reopenRemoteProcessForReview");
  });
});
