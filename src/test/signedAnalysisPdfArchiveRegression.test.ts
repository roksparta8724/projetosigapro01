import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSignedAnalysisArchiveDocument,
  isSignedAnalysisVersionArchived,
  signedAnalysisArchiveLabel,
} from "@/lib/signedAnalysisArchive";
import type { ProcessDocument } from "@/lib/platform";
const file = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("SIGAPRO: PDFs assinados e integridade documental", () => {
  const stored: ProcessDocument = {
    id: "arquivo-1", label: signedAnalysisArchiveLabel(2, "ABC-2026"), required: false,
    uploaded: true, signed: true, version: 2, source: "prefeitura", reviewStatus: "aprovado",
    filePath: "municipalities/municipio/documentos-assinados/documento.pdf",
  };
  it("localiza PDF com assinatura e vínculo persistente", () => {
    expect(isSignedAnalysisArchiveDocument(stored)).toBe(true);
    expect(isSignedAnalysisVersionArchived([stored], 2, "ABC-2026")).toBe(true);
    expect(isSignedAnalysisVersionArchived([stored], 1, "ABC-2026")).toBe(false);
    expect(isSignedAnalysisVersionArchived([stored], 2, "OUTRO")).toBe(false);
  });
  it("não rotula como PDF original um registro de assinatura ou upload inexistente", () => {
    expect(isSignedAnalysisArchiveDocument({ ...stored, filePath: "" })).toBe(false);
    expect(isSignedAnalysisArchiveDocument({ ...stored, signed: false })).toBe(false);
    expect(isSignedAnalysisArchiveDocument({ ...stored, source: "profissional" })).toBe(false);
    expect(isSignedAnalysisArchiveDocument({ ...stored, uploaded: false })).toBe(false);
    expect(() => signedAnalysisArchiveLabel(2, "")).toThrow();
  });
  it("arquiva somente após as duas assinaturas oficiais e conferência do banco", () => {
    const analysis = file("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
    expect(analysis).toContain("if (technicalPdfOfficial && directorPdfOfficial && isInternalRole(session.role))");
    expect(analysis).toContain("buildChecklistSignaturePayload(pdfState, process, municipalityId)");
    expect(analysis).toContain("getProcessArtifactSignatures(process.id, ANALYSIS_ARTIFACT_KEY)");
    expect(analysis).toContain('signer.slot === "analise_tecnica"');
    expect(analysis).toContain('signer.slot === "diretoria"');
    expect(analysis).toContain("stableSignatureStringify(block?.payload ?? {})");
    expect(analysis).toContain('bucket: "process-documents"');
    expect(analysis).toContain("await appendProcessDocuments(process.id,");
    expect(analysis).toContain("crypto.subtle.digest");
    expect(analysis).toContain("PDF aberto, mas não arquivado");
  });
  it("mantém PDFs assinados fora do checklist obrigatório e disponíveis em pasta própria", () => {
    const detail = file("src/pages/saas/ProcessDetailPage.tsx");
    const folder = file("src/components/platform/SignedAnalysisArchiveFolder.tsx");
    expect(detail).toContain("const regularProcessDocuments = process.documents.filter((document) => !isSignedAnalysisArchiveDocument(document))");
    expect(detail).toContain("const requiredAnalysisDocuments = regularProcessDocuments.filter(");
    expect(detail).toContain("const visibleDocumentRows =");
    expect(detail).toContain("<SignedAnalysisArchiveFolder");
    expect(detail).toContain("!isExternalProcessViewer && isInternalRole(session.role)");
    expect(folder).toContain('data-signed-evidence-only="true"');
    expect(folder).toContain('data-signed-pdf-archived="true"');
    expect(folder).toContain("getProcessArtifactVersionHistory");
    expect(folder).toContain("o PDF histórico original não foi arquivado");
  });
  it("corrige exatamente a legenda das etiquetas, mantendo as cores dos ícones", () => {
    const page = file("src/pages/saas/ExternalProcessControlPage.tsx");
    const css = file("src/styles/surface-polarity.css");
    expect(page).toContain('WebkitTextFillColor: "#f8fafc"');
    expect(page).toContain('style={{ color: marker.color, fill: marker.color }}');
    const rules = css.slice(css.indexOf("MARCADORES EXTERNOS V24"));
    expect(rules).toContain('[data-external-marker-label="true"]');
    expect(rules).not.toContain("svg");
    expect(rules).not.toContain(".sig-premium-topbar");
  });
});
