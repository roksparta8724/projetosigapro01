import { normalizeUrbanCode, type UrbanRegulationVersion } from "@/lib/urbanPrecheck";

/** Reject impossible or malformed legal dates before comparing validity windows. */
function validLegalDate(value:unknown):value is string {
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const normalized=new Date(value+"T00:00:00.000Z");
  return Number.isFinite(normalized.getTime())&&normalized.toISOString().slice(0,10)===value;
}

/** The server returns one versioned evidence-scope record per verified metric. */
export type UrbanLegalEvidenceScope = {
  id: string;
  municipality_id: string;
  zone_code: string;
  use_code: string;
  metric: string;
  document_title: string;
  document_sha256: string;
  page_number: number;
  excerpt: string;
  verification_method: "text_layer_verified" | "visual_double_transcription" | "browser_ocr_human_verified";
  effective_from: string;
  effective_until: string | null;
};

export function evidenceCoversUrbanRule(
  version: UrbanRegulationVersion, metric: string, item: UrbanLegalEvidenceScope,
): boolean {
  if (item.municipality_id !== version.municipality_id ||
    normalizeUrbanCode(item.zone_code) !== normalizeUrbanCode(version.zone_code) ||
    normalizeUrbanCode(item.use_code) !== normalizeUrbanCode(version.use_code) ||
    item.metric !== metric ||
    !item.id?.trim() || !item.document_title?.trim() ||
    !/^[a-f0-9]{64}$/i.test(item.document_sha256) ||
    !Number.isInteger(item.page_number) || item.page_number < 1 ||
    (item.verification_method !== "text_layer_verified" &&
      item.verification_method !== "visual_double_transcription") ||
    !item.excerpt || item.excerpt.trim().length < 15 ||
    !validLegalDate(version.effective_from) ||
    !validLegalDate(item.effective_from) ||
    item.effective_from > version.effective_from ||
    (item.effective_until != null && (
      !validLegalDate(item.effective_until) ||
      item.effective_until < item.effective_from ||
      item.effective_until < version.effective_from
    ))
  ) return false;
  return true;
}

export function countCoveredUrbanMetrics(
  version: UrbanRegulationVersion, items: UrbanLegalEvidenceScope[],
): number {
  return version.rules.filter((rule) =>
    items.some((entry) => evidenceCoversUrbanRule(version, rule.metric, entry))).length;
}
