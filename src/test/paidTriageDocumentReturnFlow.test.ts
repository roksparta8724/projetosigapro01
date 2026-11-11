import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildProcessDocuments } from "@/lib/platform";

const detail = readFileSync("src/pages/saas/ProcessDetailPage.tsx", "utf8");

describe("SIGAPRO: paid protocol automatically returned for document correction", () => {
  it("does not trap the owning external professional in a draft-only upload policy", () => {
    expect(detail).toContain('process.status === "rascunho" || process.status === "pendencia_documental"');
    expect(detail).toContain('processBelongsToExternalProfessional(session, process)');
    expect(detail).toContain('matchesOperationalScope(effectiveScopeId, process)');
    expect(detail).toContain('session.role === "profissional_externo"');
    expect(detail).not.toContain('const canUploadProcessDocuments = session.role === "profissional_externo" && process?.status === "rascunho"');
  });
  it("shows missing checklist slots to the external owner without calling them uploaded", () => {
    const docs = buildProcessDocuments("Aprovação de Projeto Comercial", []);
    for (const required of ["Projeto arquitetonico", "Memorial descritivo", "ART ou RRT", "Matricula do imovel"]) {
      const slot = docs.find(d => d.label === required);
      expect(slot).toBeDefined();
      expect(slot?.required).toBe(true);
      expect(slot?.uploaded).toBe(false);
      expect(slot?.reviewStatus).toBe("pendente");
    }
    expect(detail).toContain('const documentSlots = buildProcessDocuments(');
    expect(detail).toContain('process.type, process.documents, process.tenantId, effectiveScopeId');
    expect(detail).toContain('isInternalRole(session.role) || canUploadProcessDocuments');
    // Regression: uploading one document must not erase the other pending slots.
    const partial = buildProcessDocuments("Aprovação de Projeto Comercial", [{
      id: "doc1", label: "Projeto arquitetonico", required: true, uploaded: true,
      signed: false, reviewStatus: "pendente", version: 1, source: "profissional",
      filePath: "municipalities/scope/protocols/owner/doc1.pdf",
    }]);
    expect(partial.find(d => d.label === "Projeto arquitetonico")?.uploaded).toBe(true);
    expect(partial.find(d => d.label === "Memorial descritivo")?.uploaded).toBe(false);
    expect(partial.find(d => d.label === "ART ou RRT")?.uploaded).toBe(false);
    expect(detail).toContain('canRecoverStoredDocuments && !document.uploaded');
    expect(detail).toContain('handleUploadMissingDocument(document)');
    expect(detail).toContain("const canRecoverStoredDocuments =");
    expect(detail).toContain("canUploadProcessDocuments ||");
  });
  it("persists uploaded bytes and process record; never skips official triage", () => {
    const start=detail.indexOf("const handleUploadMissingDocument = async");
    const end=detail.indexOf("const handleRequirementAttachment =",start);
    const upload=detail.slice(start,end);
    expect(start).toBeGreaterThan(0);
    expect(upload).toContain("if (!canUploadProcessDocuments)");
    expect(upload).toContain("await uploadFileToStorage");
    expect(upload).toContain('bucket: "process-documents"');
    expect(upload).toContain("await appendProcessDocuments(");
    expect(upload).not.toContain("markGuideAsPaid");
    expect(upload).not.toContain("updateProcessStatus");
    // The existing Neon process_documents insert trigger calls the real
    // automatic triage evaluator when each official upload arrives.
  });
});