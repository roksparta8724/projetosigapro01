import type { ProcessRecord } from "@/lib/platform";

function normalizeLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function getMissingApprovalDocumentTypes(process: Pick<ProcessRecord, "type" | "documents">): string[] {
  if (!/(aprov|licenciament|arquitet|projeto)/i.test(process.type) || /habite.?se/i.test(process.type)) return [];
  const labels = process.documents.filter((d) => d.required && d.uploaded && d.reviewStatus === "aprovado")
    .map((d) => normalizeLabel(d.label));
  return [
    { name: "Projeto Arquitetônico", matches: (x: string) => x.includes("projeto arquitetonico") },
    { name: "Memorial Descritivo", matches: (x: string) => x.includes("memorial descritivo") },
    { name: "ART/RRT", matches: (x: string) => /(^|[^a-z])(art|rrt)([^a-z]|$)/.test(x) },
    { name: "Escritura/Matrícula", matches: (x: string) => /escritura|matricula/.test(x) },
  ].filter((item) => !labels.some(item.matches)).map((item) => item.name);
}

export function getMissingRequiredDocuments(process: Pick<ProcessRecord, "type" | "documents">): number {
  const missingFiles = process.documents.filter((d) => d.required && !d.uploaded).length;
  const missingCategories = getMissingApprovalDocumentTypes(process).length;
  const hasRequired = process.documents.some((d) => d.required && d.uploaded);
  if (!hasRequired) return Math.max(1, missingFiles, missingCategories);
  return Math.max(missingFiles, missingCategories);
}

export function getPendingTriageDocuments(process: Pick<ProcessRecord, "type" | "documents">): number {
  const pendingReview = process.documents.filter(
    (d) => d.required && (!d.uploaded || d.reviewStatus !== "aprovado"),
  ).length;
  const missingCategories = getMissingApprovalDocumentTypes(process).length;
  const hasApprovedRequired = process.documents.some((d) => d.required && d.uploaded && d.reviewStatus === "aprovado");
  if (!hasApprovedRequired) return Math.max(1, pendingReview, missingCategories);
  return Math.max(pendingReview, missingCategories);
}
