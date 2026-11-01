import { normalizeUrbanCode, validateUrbanRules } from "../src/lib/urbanPrecheck.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const VERIFICATION_METHODS = new Set([
  "text_layer_verified", "visual_double_transcription", "browser_ocr_human_verified",
]);

type RecordItem = Record<string, unknown>;
export type UrbanLegalReadiness = {
  readiness: "missing_regulations" | "missing_evidence" | "manual_review_available";
  referenceDate: string;
  activeRegulations: number;
  scopedVerifiedEvidence: number;
  // Coverage is computed ONLY from evidence matching active rule scope and metric.
  // This never establishes that the law is current or a project is compliant.
  matchedMetricCoverage: { required: number; matched: number; missing: number };
  resultLimits: { regulations: number; evidence: number; potentiallyTruncated: boolean };
  citedEvidence: Array<{
    title: string;
    page: number;
    metric: string;
    excerpt: string;
    zone: string;
    usage: string;
    from: string;
    until: string | null;
    verification: string;
  }>;
};

function isObject(value: unknown): value is RecordItem {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function isMunicipalityUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function asText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** Fail closed; this is only an inventory for human review, NOT AI grounding. */
export function summarizeUrbanLegalReadiness(
  versions: unknown,
  evidence: unknown,
  municipalityId: string,
  referenceDate: string,
): UrbanLegalReadiness {
  if (!isMunicipalityUuid(municipalityId) || !validDate(referenceDate) ||
    !Array.isArray(versions) || !Array.isArray(evidence)) {
    throw new Error("INVALID_LEGAL_READINESS_INPUT");
  }
  // The SQL RPCs already enforce the authenticated tenant. Filtering again
  // ensures that accidentally mixed or malformed rows never enter responses.
  const active = versions.filter((entry) =>
    isObject(entry) && entry.municipality_id === municipalityId &&
    entry.status === "active" && validDate(entry.effective_from) &&
    entry.effective_from <= referenceDate &&
    typeof entry.zone_code === "string" && entry.zone_code.trim().length > 0 &&
    typeof entry.use_code === "string" && entry.use_code.trim().length > 0 &&
    validateUrbanRules(entry.rules),
  );
  const verified = evidence.filter((entry) =>
    isObject(entry) && entry.municipality_id === municipalityId &&
    isMunicipalityUuid(entry.evidence_id) &&
    typeof entry.document_title === "string" && entry.document_title.trim().length >= 4 &&
    typeof entry.document_sha256 === "string" && SHA256.test(entry.document_sha256) &&
    typeof entry.page_number === "number" &&
    Number.isInteger(entry.page_number) && entry.page_number > 0 &&
    typeof entry.metric === "string" && entry.metric.trim().length > 0 &&
    typeof entry.excerpt === "string" && entry.excerpt.trim().length >= 8 &&
    typeof entry.zone_code === "string" && entry.zone_code.trim().length > 0 &&
    typeof entry.use_code === "string" && entry.use_code.trim().length > 0 &&
    VERIFICATION_METHODS.has(String(entry.verification_method)) &&
    validDate(entry.effective_from) && entry.effective_from <= referenceDate &&
    (entry.effective_until === null || entry.effective_until === undefined ||
      (validDate(entry.effective_until) && entry.effective_until >= referenceDate)),
  );
  // A completely unrelated legal excerpt (other zone, other use or other
  // metric) must NEVER make a municipality appear ready for legal review.
  // Do not use the historical matrix staging records: only active versions.
  const scopeMetric = (zone: string, usage: string, metric: string) =>
    JSON.stringify([normalizeUrbanCode(zone), normalizeUrbanCode(usage), metric]);
  const required = new Set<string>();
  for (const version of active) {
    for (const rule of version.rules) {
      required.add(scopeMetric(version.zone_code, version.use_code, rule.metric));
    }
  }
  const matchedEvidence = verified.filter((entry) =>
    required.has(scopeMetric(entry.zone_code, entry.use_code, entry.metric)));
  const matchedMetrics = new Set(matchedEvidence.map((entry) =>
    scopeMetric(entry.zone_code, entry.use_code, entry.metric)));
  const missing = Math.max(0, required.size - matchedMetrics.size);
  const potentiallyTruncated = versions.length >= 200 || evidence.length >= 250;
  return {
    readiness: active.length === 0 ? "missing_regulations" :
      missing > 0 || potentiallyTruncated ? "missing_evidence" : "manual_review_available",
    referenceDate,
    activeRegulations: active.length,
    scopedVerifiedEvidence: matchedEvidence.length,
    matchedMetricCoverage: { required: required.size, matched: matchedMetrics.size, missing },
    resultLimits: { regulations: 200, evidence: 250, potentiallyTruncated },
    citedEvidence: matchedEvidence.slice(0, 6).map((item) => ({
      title: asText(item.document_title, 180),
      page: item.page_number as number,
      metric: asText(item.metric, 80),
      excerpt: asText(item.excerpt, 500),
      zone: asText(item.zone_code, 60),
      usage: asText(item.use_code, 60),
      from: item.effective_from as string,
      until: validDate(item.effective_until) ? item.effective_until : null,
      verification: item.verification_method as string,
    })),
  };
}
