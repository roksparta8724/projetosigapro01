import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isUrbanMatrixBatchArchived, latestUrbanMatrixBatchEvent } from "@/lib/urbanMatrixBatchStatus";
import type { UrbanMatrixBatchEvent } from "@/integrations/backend/urbanPrecheckClient";

function event(id: string, batchId: string, action: "archive" | "restore", time: string): UrbanMatrixBatchEvent {
  return { id, batch_id: batchId, action, note: "Conferência humana documentada", created_at: time, actor_profile_id: "qa" };
}

describe("SIGAPRO QA — ciclo de vida de documentos legais e auditoria guiada", () => {
  const history = [
    event("old", "lot-1", "archive", "2026-10-31T15:00:00Z"),
    event("new", "lot-1", "restore", "2026-11-01T12:00:00Z"),
    event("another", "lot-2", "archive", "2026-11-01T16:00:00Z"),
  ];

  it("seleciona o evento mais recente mesmo em histórico desordenado e isola outro lote", () => {
    expect(latestUrbanMatrixBatchEvent(history, "lot-1")?.action).toBe("restore");
    expect(isUrbanMatrixBatchArchived(history, "lot-1")).toBe(false);
    expect(isUrbanMatrixBatchArchived(history, "lot-2")).toBe(true);
    expect(isUrbanMatrixBatchArchived(history, "missing")).toBe(false);
    expect(isUrbanMatrixBatchArchived([...history, event("late", "lot-1", "archive", "2026-11-06T09:00:00Z")], "lot-1")).toBe(true);
  });

  it("considera o mesmo lote restaurado na conferência, nas evidências e na auditoria", () => {
    const matrix = readFileSync("src/components/platform/UrbanLegalMatrixReviewPanel.tsx", "utf8");
    const evidence = readFileSync("src/components/platform/UrbanRegulationEvidencePanel.tsx", "utf8");
    const audit = readFileSync("src/components/platform/UrbanAiReadinessPanel.tsx", "utf8");
    expect(matrix).toContain("isUrbanMatrixBatchArchived(latestEvents, batch.id)");
    expect(matrix).toContain("latestUrbanMatrixBatchEvent(audit.batch_events, id)");
    expect(evidence).toContain("isUrbanMatrixBatchArchived(audit.batch_events, batch.id)");
    expect(audit).toContain("isUrbanMatrixBatchArchived(audit.batch_events, batch.id)");
  });

  it("atualiza o painel após revisão jurídica do Quadro II e após salvar a evidência, sem ativar automaticamente", () => {
    const review = readFileSync("src/components/platform/UrbanQuadroIILegalReviewPanel.tsx", "utf8");
    const workspace = readFileSync("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx", "utf8");
    const evidence = readFileSync("src/components/platform/UrbanRegulationEvidencePanel.tsx", "utf8");
    const settings = readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx", "utf8");
    expect(review).toContain("onDataChanged?.()");
    expect(workspace).toContain("onDataChanged={onDataChanged}");
    expect(evidence).toContain("onDataChanged?.()");
    expect(settings).toContain("onDataChanged={markAuditChanged}");
    expect(review).toContain("RASCUNHO");
    expect(review).not.toContain("activateUrbanRegulation(");
  });

  it("oferece ações de verdade e informa quando um perfil não pode acessar a etapa", () => {
    const audit = readFileSync("src/components/platform/UrbanAiReadinessPanel.tsx", "utf8");
    expect(audit).toContain("data-urban-readiness-progress");
    expect(audit).toContain("data-urban-readiness-primary-action");
    expect(audit).toContain('target: "pdfs"');
    expect(audit).toContain('target: "evidence"');
    expect(audit).toContain('[data-legal-archive="true"]');
    expect(audit).toContain('details[data-urban-regulation-evidence="true"]');
    expect(audit).toContain('details[data-urban-legal-editor="true"]');
    expect(audit).toContain("data-urban-navigation-feedback");
    const settings = readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx", "utf8");
    const matrix = readFileSync("src/components/platform/UrbanLegalMatrixReviewPanel.tsx", "utf8");
    expect(settings).toContain("focusRegisteredCaveats={reviewCaveatFocus}");
    expect(matrix).toContain("setShowRegisteredCaveats(true)");
    expect(audit).not.toContain("activateUrbanRegulation(");
  });
});
