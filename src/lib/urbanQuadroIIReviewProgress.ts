import type { QuadroIIQueueItem } from "@/lib/urbanQuadroIIReviewQueue";
import type { UrbanReviewedMatrixImport } from "@/integrations/backend/urbanPrecheckClient";

const key = (page: number, code: string) =>
  page + ":" + code.normalize("NFKC").trim().toLocaleUpperCase("pt-BR");

/** A preliminary legal draft confirms one category/zone only; never activates a law. */
export function summarizeQuadroIIReviewProgress(
  queue: readonly QuadroIIQueueItem[], imports: readonly UrbanReviewedMatrixImport[],
  municipalityId: string, documentSha256: string,
) {
  const reviewedKeys = new Set<string>();
  if (municipalityId && /^[a-f0-9]{64}$/i.test(documentSha256)) {
    for (const item of imports) {
      if (item.municipality_id !== municipalityId ||
          item.document_sha256?.toLowerCase() !== documentSha256.toLowerCase() ||
          item.quadro !== "II" || item.status !== "reviewed_draft" ||
          !Number.isInteger(item.page_number) || item.page_number < 1 ||
          !item.zone_code?.trim() || !item.use_code?.trim() ||
          !/^\d{4}-\d{2}-\d{2}$/.test(item.effective_from || "")) continue;
      reviewedKeys.add(key(item.page_number, item.use_code));
    }
  }
  return {
    withFirstReview: queue.filter(item => reviewedKeys.has(key(item.pageNumber, item.categoryCode))),
    withoutFirstReview: queue.filter(item => !reviewedKeys.has(key(item.pageNumber, item.categoryCode))),
    reviewedKeys,
    legallyActive: 0 as const,
  };
}
