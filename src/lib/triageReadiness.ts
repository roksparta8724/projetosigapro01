import { getProcessPaymentGuides, type ProcessRecord } from "@/lib/platform";

/** A database record isn't an attachment until a real file reference exists. */
export function hasPersistedProcessDocumentFile(document: { file_path?: unknown; preview_url?: unknown }): boolean {
  return [document.file_path, document.preview_url].some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

/** Validation must match the actual PDF/file availability, not just a boolean flag. */
function hasReadyFile(document: ProcessRecord["documents"][number]): boolean {
  return document.uploaded === true &&
    [document.filePath, document.previewUrl].some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
}

function normalizeLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function getMissingApprovalDocumentTypes(process: Pick<ProcessRecord, "type" | "documents">): string[] {
  if (!/(aprov|licenciament|arquitet|projeto)/i.test(process.type) || /habite.?se/i.test(process.type)) return [];
  // A conferência do Protocolo verifica o arquivo recebido, NÃO o parecer técnico.
  // reviewStatus pertence à Análise e só pode ser definido após despacho.
  const labels = process.documents.filter((d) => d.required && hasReadyFile(d))
    .map((d) => normalizeLabel(d.label));
  return [
    { name: "Projeto Arquitetônico", matches: (x: string) => x.includes("projeto arquitetonico") },
    { name: "Memorial Descritivo", matches: (x: string) => x.includes("memorial descritivo") },
    { name: "ART/RRT", matches: (x: string) => /(^|[^a-z])(art|rrt)([^a-z]|$)/.test(x) },
    { name: "Escritura/Matrícula", matches: (x: string) => /escritura|matricula/.test(x) },
  ].filter((item) => !labels.some(item.matches)).map((item) => item.name);
}

export function getMissingRequiredDocuments(process: Pick<ProcessRecord, "type" | "documents">): number {
  const missingFiles = process.documents.filter((d) => d.required && !hasReadyFile(d)).length;
  const missingCategories = getMissingApprovalDocumentTypes(process).length;
  const hasRequired = process.documents.some((d) => d.required && hasReadyFile(d));
  if (!hasRequired) return Math.max(1, missingFiles, missingCategories);
  return Math.max(missingFiles, missingCategories);
}

/** A triagem confere entrega documental; não exige aprovação urbanística. */
export function getPendingTriageDocuments(process: Pick<ProcessRecord, "type" | "documents">): number {
  return getMissingRequiredDocuments(process);
}

/** Gateway to dispatch: payment, document review and completed triage, independently ordered. */
export function hasCompensatedInitialGuide(process: ProcessRecord): boolean {
  return getProcessPaymentGuides(process).some(
    (guide) => guide.kind === "protocolo" && guide.status === "compensada",
  );
}

export function isReadyForProtocolDispatch(process: ProcessRecord): boolean {
  return process.isOfficial !== false &&
    process.triage?.status === "concluido" &&
    getPendingTriageDocuments(process) === 0 &&
    hasCompensatedInitialGuide(process);
}
