import type { ProcessDocument } from "@/lib/platform";
export const SIGNED_ANALYSIS_ARCHIVE_PREFIX = "Ficha Técnica de Análise assinada";
export function signedAnalysisArchiveLabel(version: number, code: string): string {
  if (!code.trim()) throw new Error("Código de assinatura ausente.");
  return `${SIGNED_ANALYSIS_ARCHIVE_PREFIX} • versão ${Math.max(1, Math.trunc(version || 1))} • código ${code.trim()}`;
}
export function isSignedAnalysisArchiveDocument(doc: Pick<ProcessDocument, "label" | "signed" | "source" | "uploaded" | "filePath">) {
  return doc.signed === true && doc.uploaded === true && doc.source === "prefeitura" &&
    Boolean(doc.filePath) && doc.label.startsWith(SIGNED_ANALYSIS_ARCHIVE_PREFIX + " • versão ");
}
export function isSignedAnalysisVersionArchived(documents: ProcessDocument[], version: number, code: string): boolean {
  return documents.some((doc) => isSignedAnalysisArchiveDocument(doc) && doc.label === signedAnalysisArchiveLabel(version, code));
}
