import { describe, expect, it } from "vitest";
import type { ProcessRecord, ProcessDocument } from "@/lib/platform";
import { getMissingRequiredDocuments, getMissingApprovalDocumentTypes, getPendingTriageDocuments } from "@/lib/triageReadiness";

const doc = (label: string, status: "aprovado" | "pendente" = "aprovado"): ProcessDocument => ({
  id: label, label, required: true, uploaded: true, signed: false,
  reviewStatus: status, version: 1, source: "profissional", filePath: "qa/test-document.pdf",
});
function process(type: string, documents: ProcessDocument[]): ProcessRecord {
  return { id: "qa-04", type, documents } as ProcessRecord;
}
const complete = () => [
  doc("Projeto Arquitetônico"), doc("Memorial Descritivo"),
  doc("ART ou RRT"), doc("Escritura/Matrícula do imóvel"),
];

describe("SIGAPRO triage readiness — document completeness", () => {
  it("never treats an empty approval-document list as complete", () => {
    const p = process("Aprovação de Projeto Residencial", []);
    expect(getMissingRequiredDocuments(p)).toBe(4);
    expect(getPendingTriageDocuments(p)).toBe(4);
  });

  it("requires all four mandatory types and the review of each", () => {
    expect(getMissingApprovalDocumentTypes(process("aprovacao_projeto", complete()))).toEqual([]);
    expect(getPendingTriageDocuments(process("aprovacao_projeto", complete()))).toBe(0);
    expect(getPendingTriageDocuments(process("Aprovação de Projeto", complete().slice(0, 3)))).toBe(1);
    expect(getPendingTriageDocuments(process("Aprovação de Projeto", [ ...complete().slice(0,3), doc("Escritura/Matrícula", "pendente") ]))).toBe(1);
  });

  it("preserves Habite-se's own documentary requirements", () => {
    const habite = process("Habite-se", [doc("Relatório de Vistoria")]);
    expect(getMissingApprovalDocumentTypes(habite)).toEqual([]);
    expect(getPendingTriageDocuments(habite)).toBe(0);
    expect(getPendingTriageDocuments(process("Habite-se", []))).toBe(1);
  });

  it("rejects optional-only attachments and accepts valid custom-service documents", () => {
    expect(getPendingTriageDocuments(process("Serviço municipal", [{...doc("Outros"), required: false}]))).toBe(1);
    expect(getPendingTriageDocuments(process("Serviço municipal", [doc("Declaração")]))).toBe(0);
  });

  it("blocks missing uploaded files despite a misleading approved status", () => {
    expect(getPendingTriageDocuments(process("Aprovação de Projeto", [{ ...complete()[0], uploaded: false }, ...complete().slice(1)]))).toBe(1);
  });
});
