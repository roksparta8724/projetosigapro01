import type { ProcessDocument } from "@/lib/platform";

export const SIGNED_ANALYSIS_ARCHIVE_PREFIX = "Ficha Técnica de Análise assinada";

// Compatibility is restricted to the exact historical filename convention.
// A generic PDF, a signature row without a file, or a different Prefeitura's
// document must never be inferred to be the signed analysis archive.
const LEGACY_LABELS = new Set([
  "Ficha Técnica - assinada pelo Analista",
  "Ficha Técnica - assinada pelo Analista e Diretoria",
]);
const LEGACY_SIGNED_FILENAME = /^Ficha-Tecnica-Assinada-.+-v([1-9]\d*)-(analista|diretoria)-([A-Za-z0-9_-]{6,48})\.pdf$/i;

type ArchiveRecord = Pick<ProcessDocument, "label" | "signed" | "source" | "uploaded" | "filePath"> &
  Partial<Pick<ProcessDocument, "fileName" | "version">>;

function legacyArchiveIdentity(doc: ArchiveRecord) {
  if (!LEGACY_LABELS.has(doc.label)) return null;
  const match = LEGACY_SIGNED_FILENAME.exec(doc.fileName || "");
  if (!match) return null;
  const version = Number(match[1]);
  if (!Number.isSafeInteger(version) || version < 1 || (doc.version != null && doc.version !== version)) return null;
  return { version, code: match[3] };
}

export function signedAnalysisArchiveLabel(version: number, code: string): string {
  if (!code.trim()) throw new Error("Código de assinatura ausente.");
  return `${SIGNED_ANALYSIS_ARCHIVE_PREFIX} • versão ${Math.max(1, Math.trunc(version || 1))} • código ${code.trim()}`;
}

export function isSignedAnalysisArchiveDocument(doc: ArchiveRecord): boolean {
  return doc.signed === true && doc.uploaded === true && doc.source === "prefeitura" &&
    Boolean(doc.filePath?.trim()) &&
    (doc.label.startsWith(SIGNED_ANALYSIS_ARCHIVE_PREFIX + " • versão ") ||
      legacyArchiveIdentity(doc) !== null);
}

export function isSignedAnalysisVersionArchived(documents: ProcessDocument[], version: number, code: string): boolean {
  const canonicalLabel = signedAnalysisArchiveLabel(version, code);
  const sanitizedCode = code.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return documents.some((doc) => {
    if (!isSignedAnalysisArchiveDocument(doc)) return false;
    if (doc.label === canonicalLabel) return true;
    const legacy = legacyArchiveIdentity(doc);
    return legacy !== null && legacy.version === version && legacy.code === sanitizedCode;
  });
}
