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
