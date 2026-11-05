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
 * Quoted evidence must explicitly name the measurement and reproduce its number
 * with the same unit. This prevents a model from silently changing 0,25 into 25%,
 * reading a lot area as a setback, or interpreting centimetres as metres.
 * A valid quote STILL requires visual inspection by an authorized analyst.
 */
const metricLabels: Record<UrbanMetric, RegExp> = {
  front_setback_m: /(?:recuo|afastamento)\s+(?:minimo\s+)?(?:frontal|da\s+frente)\b/,
  side_setback_m: /(?:recuo|afastamento)\s+(?:minimo\s+)?(?:lateral|dos\s+lados)\b/,
  rear_setback_m: /(?:recuo|afastamento)\s+(?:minimo\s+)?(?:de\s+)?(?:fundos|fundo|posterior)\b/,
  permeability_percent: /\b(?:taxa\s+de\s+)?permeabilidade\b/,
  occupancy_percent: /\b(?:taxa\s+de\s+)?ocupacao\b/,
  floor_area_ratio: /\b(?:ca|c\.?\s*a\.?|coef(?:iciente)?\.?\s*(?:de\s+)?apro(?:veitamento)?\.?)\b/,
  floor_area_ratio_min: /\b(?:ca|c\.?\s*a\.?|coef(?:iciente)?\.?\s*(?:de\s+)?apro(?:veitamento)?\.?)\b/,
  lot_area_m2: /\b(?:area\s+(?:total\s+)?(?:do\s+)?(?:lote|terreno)|superficie\s+do\s+terreno)\b/,
  lot_frontage_m: /\b(?:testada|frente\s+do\s+lote|largura\s+do\s+lote)\b/,
  height_m: /\b(?:altura\s+(?:total\s+)?(?:da\s+edificacao|do\s+predio)?|gabarito)\b/,
  floor_count: /\b(?:pavimentos?|andares?|numero\s+de\s+pavimentos?)\b/,
};

function quotedNumber(raw: string): number | null {
  if (!/^\d+(?:[.,]\d+)*$/.test(raw)) return null;
  let normalized = raw;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",") && raw.includes(".")) {
    const separator = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
    normalized = raw.slice(0, separator).replace(/[.,]/g, "") + "." +
      raw.slice(separator + 1);
  } else {
    normalized = raw.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reject on uncertainty instead of applying an unverified number to a process. */
export function quoteSupportsArchitecturalReading(
  metric: UrbanMetric, value: number, quote: string,
): boolean {
  if (!Number.isFinite(value) || value < 0 || !quote) return false;
  const normalized = quote.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
  const label = metricLabels[metric].exec(normalized);
  if (!label) return false;
  const following = normalized.slice(label.index + label[0].length).slice(0, 64);
  const found = /\d+(?:[.,]\d+)*/.exec(following);
  if (!found || found.index > 32) return false;
  const quoted = quotedNumber(found[0]);
  if (quoted === null || Math.abs(quoted - value) > 0.000001) return false;
  const suffix = following.slice(found.index + found[0].length);
  if (metric === "occupancy_percent" || metric === "permeability_percent") {
    return /^\s*(?:%|por\s+cento\b)/.test(suffix);
  }
  if (metric === "lot_area_m2") {
    return /^\s*(?:m\s*(?:²|2|\^2)(?![a-z0-9])|metros?\s+quadrados?\b)/.test(suffix);
  }
  if (["front_setback_m","side_setback_m","rear_setback_m","lot_frontage_m","height_m"].includes(metric)) {
    return /^\s*(?:m\b(?!\s*(?:2|²|\^2))|metros?\b)(?!\s*(?:²|2|\^2))/.test(suffix);
  }
  // CA is dimensionless and floors are an integer count, never a length or rate.
  return !/^\s*(?:%|m\b|metros?\b)/.test(suffix);
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
    const candidate = typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100000 &&
      (!percentMetrics.has(key) || n <= 100) &&
      (key !== "floor_count" || Number.isInteger(n)) ? n : null;
    const p = item?.page;
    const page = typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 2000 ? p : null;
    const quote = plain(item?.quote, 240);
    const confidence: DrawingReading["confidence"] =
      item?.confidence === "high" || item?.confidence === "medium" ||
      item?.confidence === "low" ? item.confidence : "not_found";
    const quoteConsistent = candidate !== null && quoteSupportsArchitecturalReading(key, candidate, quote);
    // Never return a usable number to the UI without literal, unit-consistent,
    // page-specific evidence; extractions remain advisory, not project approval.
    const value = documentType === "architectural_plan" &&
      (hasSitePlan || !setbacks.has(key)) && rawMatches.length === 1 &&
      page !== null && quote.length >= 8 &&
      quoteConsistent && (confidence === "high" || confidence === "medium") ? candidate : null;
    const usableForReview = documentType === "architectural_plan" &&
      (hasSitePlan || !setbacks.has(key)) && value !== null;
    const reason = rawMatches.length > 1 ? "Leituras conflitantes: revisar manualmente." :
      (!hasSitePlan && setbacks.has(key)) ? "Sem planta de implantação confirmada: recuo não verificável." :
      documentType !== "architectural_plan" ? "O PDF não foi reconhecido com segurança como projeto arquitetônico." :
      candidate === null ? "Medida não localizada ou numericamente inválida." :
      page === null || quote.length < 8 ? "Sem página e trecho verificáveis." :
      confidence === "low" ? "Leitura incerta: confirmar na planta original." :
      confidence === "not_found" ? "Medida não localizada." :
      !quoteConsistent ? "Citação, valor ou unidade incompatíveis: conferir no PDF original." :
      "Aguardando conferência do analista.";
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

/**
 * The document analyst may pass individually checked drawing readings into the
 * municipal legal precheck through same-origin router history state.
 * This is not a backend approval, saved result, or a legal-source attestation.
 */
export type ReviewedDrawingFields = Partial<Record<UrbanMetric, {value:string;evidence:string}>>;
export type ReviewedDrawingHandoff = {
  kind:"sigapro.ai.reviewed-drawing.v1";
  processId:string;
  municipalityId:string;
  documentId:string;
  documentVersion:number;
  documentName:string;
  createdAt:number;
  reviewed:ReviewedDrawingFields;
};

export function createReviewedDrawingHandoff(input: {
  processId:string;municipalityId:string;
  document:{id:string;version:number;fileName:string};
  reviewed:ReviewedDrawingFields;
}): {sigaproReviewedDrawing:ReviewedDrawingHandoff} | null {
  if(!input.processId||!input.municipalityId||!input.document.id||
    !Number.isSafeInteger(input.document.version)||input.document.version<1||
    !input.document.fileName.trim())return null;
  const reviewed:ReviewedDrawingFields={};
  for(const {key} of URBAN_METRICS){
    const item=input.reviewed[key];
    if(!item)continue;
    if(typeof item.value!=="string"||typeof item.evidence!=="string"||
      !/^\\d+(?:[.,]\\d+)?$/.test(item.value.trim())||
      !Number.isFinite(Number(item.value.replace(",",".")))||
      item.evidence.length>500||
      !item.evidence.includes(input.document.fileName)||
      !/página \\d+/i.test(item.evidence))return null;
    reviewed[key]={value:item.value,evidence:item.evidence};
  }
  if(!Object.keys(reviewed).length)return null;
  return {sigaproReviewedDrawing:{
    kind:"sigapro.ai.reviewed-drawing.v1",processId:input.processId,
    municipalityId:input.municipalityId,
    documentId:input.document.id,documentVersion:input.document.version,
    documentName:input.document.fileName,createdAt:Date.now(),reviewed,
  }};
}

export function readReviewedDrawingHandoff(
  state:unknown,
  context:{
    processId:string;municipalityId:string;
    documents:readonly {id:string;version:number;fileName:string;uploaded:boolean}[];
  },
  now=Date.now(),
):ReviewedDrawingFields|null {
  const stateObject=record(state);
  const raw=record(stateObject?.sigaproReviewedDrawing);
  if(!raw||raw.kind!=="sigapro.ai.reviewed-drawing.v1"||
    raw.processId!==context.processId||
    raw.municipalityId!==context.municipalityId||
    typeof raw.documentId!=="string"||
    typeof raw.documentName!=="string"||
    typeof raw.documentVersion!=="number"||
    typeof raw.createdAt!=="number"||
    raw.createdAt>now+60000||now-raw.createdAt>15*60000)return null;
  const doc=context.documents.find(item=>item.id===raw.documentId &&
    item.version===raw.documentVersion && item.fileName===raw.documentName &&
    item.uploaded===true);
  if(!doc)return null;
  const rows=record(raw.reviewed);
  if(!rows||!Object.keys(rows).length||Object.keys(rows).length>URBAN_METRICS.length)return null;
  const reviewed:ReviewedDrawingFields={};
  for(const [metric,rawValue] of Object.entries(rows)){
    if(!allMetrics.has(metric))return null;
    const field=record(rawValue);
    if(!field||typeof field.value!=="string"||typeof field.evidence!=="string"||
      !/^\\d+(?:[.,]\\d+)?$/.test(field.value.trim())||
      !Number.isFinite(Number(field.value.replace(",",".")))||
      field.evidence.length>500||field.evidence.length<12||
      !field.evidence.includes(doc.fileName)||
      !/página \\d+/i.test(field.evidence))return null;
    reviewed[metric as UrbanMetric]={value:field.value,evidence:field.evidence};
  }
  return reviewed;
}
