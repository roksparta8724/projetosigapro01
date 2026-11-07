/**
 * Pure, fail-closed authorization boundary for an architectural PDF row.
 *
 * This supplements (never replaces) the database RLS and the technical
 * authorization RPC. A malformed cross-tenant row must not be sent to R2,
 * a BYOS backend or a third-party AI provider, even after a DB regression.
 */
export type ArchitecturalDocumentRow = {
  id: string;
  process_id: string;
  municipality_id: string;
  tenant_id?: string | null;
  title: string;
  file_name: string;
  file_path: string;
  mime_type?: string | null;
  file_size_bytes?: string | number | null;
  version: number;
  is_valid: boolean;
  invalidated_at: string | null;
};

export function isEligibleArchitecturalDocument(
  row: ArchitecturalDocumentRow | null | undefined,
  municipalityId: string,
  processId: string,
  documentId: string,
): row is ArchitecturalDocumentRow {
  if (!row || !municipalityId || !processId || !documentId) return false;
  if (row.id !== documentId || row.process_id !== processId) return false;
  if (row.municipality_id !== municipalityId ||
      (row.tenant_id != null && row.tenant_id !== "" && row.tenant_id !== municipalityId)) return false;
  if (row.is_valid !== true || row.invalidated_at !== null) return false;
  if (!Number.isSafeInteger(row.version) || row.version < 1) return false;

  const prefix = `municipalities/${municipalityId}/`;
  const key = row.file_path;
  if (typeof key !== "string" || !key.startsWith(prefix) ||
      key.length <= prefix.length || key.includes("..") ||
      key.includes("\\") || key.includes("//") ||
      /[\r\n\0]/.test(key)) return false;
  if (!/\.pdf$/i.test(key) || !/\.pdf$/i.test(row.file_name || "")) return false;
  if (row.mime_type && row.mime_type !== "application/pdf") return false;

  const normalizedTitle = String(row.title || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /projeto arquitetonico/.test(normalizedTitle);
}
