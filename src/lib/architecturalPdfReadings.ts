import { URBAN_METRICS, type UrbanMetric } from "./urbanPrecheck.js";

const allMetrics = new Set<string>(URBAN_METRICS.map((x) => x.key));
const percentMetrics = new Set<string>(["occupancy_percent", "permeability_percent"]);

export type DrawingReading = {
  metric: UrbanMetric;
  value: number | null;
  page: number | null;
  quote: string;
  confidence: "high" | "medium" | "low" | "not_found";
  usableForReview: boolean;
  reason: string;
};
export type DrawingExtraction = {
  documentType: "architectural_plan" | "other" | "uncertain";
  hasSitePlan: boolean;
  readings: DrawingReading[];
  warnings: string[];
  source: "ai_pdf_visual" | "ai_pdf_text";
  automaticallyApproved: false;
};

function plain(value: unknown, max = 220): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ?
    value as Record<string, unknown> : null;
}

/**
 * Zero hallucination-by-default UI contract: missing / ambiguous / conflicting
 * numbers never become measurements, and a reviewed excerpt is still not proof
 * of the underlying CAD geometry. The analyst must inspect each PDF page.
 */
export function normalizeArchitecturalPdfExtraction(raw: unknown): DrawingExtraction {
  const data = record(raw);
  if (!data) throw new Error("A IA retornou um diagnóstico que não pôde ser validado.");
  const documentType: DrawingExtraction["documentType"] =
    data.document_type === "architectural_plan" || data.document_type === "other" ?
    data.document_type : "uncertain";
  const hasSitePlan = data.has_site_plan === true && documentType === "architectural_plan";
  const warnings = Array.isArray(data.warnings) ?
    data.warnings.map(x => plain(x, 240)).filter(Boolean).slice(0, 12) : [];
  const rawRows = Array.isArray(data.metrics) ? data.metrics.slice(0, 40) : [];
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rawRows) {
    const value = record(row);
    if (!value || typeof value.metric !== "string" || !allMetrics.has(value.metric)) continue;
    const group = groups.get(value.metric) || [];
    group.push(value);
    groups.set(value.metric, group);
  }
  const setbacks = new Set<UrbanMetric>(["front_setback_m","side_setback_m","rear_setback_m"]);
  const readings = URBAN_METRICS.map(({key}) => {
    const rawMatches = groups.get(key) || [];
    const item = rawMatches.length === 1 ? rawMatches[0] : null;
    const n = item?.value;
    const value = typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100000 &&
      (!percentMetrics.has(key) || n <= 100) &&
      (key !== "floor_count" || Number.isInteger(n)) ? n : null;
    const p = item?.page;
    const page = typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 2000 ? p : null;
    const quote = plain(item?.quote, 240);
    const confidence: DrawingReading["confidence"] =
      item?.confidence === "high" || item?.confidence === "medium" ||
      item?.confidence === "low" ? item.confidence : "not_found";
    const usableForReview = documentType === "architectural_plan" &&
      (hasSitePlan || !setbacks.has(key)) &&
      rawMatches.length === 1 && value !== null && page !== null && quote.length >= 8 &&
      (confidence === "high" || confidence === "medium");
    const reason = rawMatches.length > 1 ? "Leituras conflitantes: revisar manualmente." :
      (!hasSitePlan && setbacks.has(key)) ? "Sem planta de implantação confirmada: recuo não verificável." :
      documentType !== "architectural_plan" ? "O PDF não foi reconhecido com segurança como projeto arquitetônico." :
      value === null ? "Medida não localizada ou numericamente inválida." :
      page === null || quote.length < 8 ? "Sem página e trecho verificáveis." :
      confidence === "low" ? "Leitura incerta: confirmar na planta original." :
      confidence === "not_found" ? "Medida não localizada." : "Aguardando conferência do analista.";
    return { metric: key, value, page, quote, confidence, usableForReview, reason };
  });
  if (documentType !== "architectural_plan") {
    warnings.unshift("Arquivo não classificado como planta arquitetônica. Nenhuma medida poderá ser aplicada.");
  }
  return { documentType, hasSitePlan, readings, warnings,
    source: "ai_pdf_visual", automaticallyApproved: false };
}

export function makeReviewedDrawingEvidence(
  fileName: string, page: number | null, quote: string,
): string {
  const name = plain(fileName, 100);
  if (!name || page === null || page < 1 || !quote.trim()) {
    throw new Error("Documento, página e trecho necessários para conferência.");
  }
  return ("Prancha/PDF " + name + ", página " + page +
    "; leitura de IA conferida pelo analista: " + plain(quote, 230)).slice(0, 500);
}
