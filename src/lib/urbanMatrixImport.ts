import { URBAN_METRICS, validateUrbanRules, type UrbanMetric, type UrbanRule } from "./urbanPrecheck";

export type ImportQuadro = "I" | "II";
export type UrbanExtractedCandidate = {
  kind: "numeric_index" | "use_condition";
  metric?: UrbanMetric;
  limit?: number;
  rawValue?: string;
  source_excerpt: string;
  note?: string;
};
const allowed = new Set<string>(URBAN_METRICS.map(m => m.key));
function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
const isRealDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value;
};
export function validateImportDate(date: string) { return isRealDate(date); }
/**
 * No citation is trusted if not a literal fragment of the supplied page.
 * This validation runs both server-side after LLM output and client-side
 * immediately before human-confirmed writes to the Neon database.
 */
export function extractLiteralCandidates(
  modelResult: unknown, pageText: string, quadro: ImportQuadro,
): UrbanExtractedCandidate[] {
  if (!isRecord(modelResult) || !Array.isArray(modelResult.candidates) ||
    !pageText || pageText.length > 6500) return [];
  const selected: UrbanExtractedCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of modelResult.candidates.slice(0, 16)) {
    if (!isRecord(raw) || typeof raw.source_excerpt !== "string") continue;
    const excerpt = raw.source_excerpt.trim();
    if (excerpt.length < 20 || excerpt.length > 500 || !pageText.includes(excerpt)) continue;
    if (quadro === "I" && raw.kind === "numeric_index" &&
      typeof raw.metric === "string" && allowed.has(raw.metric) &&
      typeof raw.limit === "number" && Number.isFinite(raw.limit) &&
      typeof raw.rawValue === "string" && raw.rawValue.length >= 1 &&
      raw.rawValue.length <= 30 && excerpt.includes(raw.rawValue) &&
      !seen.has(raw.metric)) {
      const metric = raw.metric as UrbanMetric;
      const candidate: UrbanRule = {metric,limit:raw.limit,reference:"Fonte temporária para validação humana"};
      if (!validateUrbanRules([candidate])) continue;
      if (metric === "floor_count" && !Number.isInteger(raw.limit)) continue;
      // A number in the excerpt is not proof that it belongs to a given zone.
      selected.push({ kind:"numeric_index",metric,limit:raw.limit,
        rawValue:raw.rawValue,source_excerpt:excerpt });
      seen.add(metric);
    } else if (quadro === "II" && raw.kind === "use_condition" &&
      typeof raw.note === "string" && raw.note.trim().length >= 8 &&
      raw.note.length <= 400 && !seen.has(excerpt)) {
      selected.push({kind:"use_condition",note:raw.note.trim(),source_excerpt:excerpt});
      seen.add(excerpt);
    }
  }
  return selected;
}
export function validatedNumericRules(
  selected: UrbanExtractedCandidate[], referencePrefix: string,
): UrbanRule[] {
  if (!referencePrefix || referencePrefix.length > 350) throw Error("Referência legal inválida.");
  const rules = selected.filter((x) => x.kind === "numeric_index").map(x => ({
    metric:x.metric!,limit:x.limit!,
    reference:referencePrefix + " — trecho: " + x.source_excerpt.slice(0, Math.max(0,480-referencePrefix.length)),
  }));
  if (!validateUrbanRules(rules)) throw Error("Índices sem dados e referências consistentes.");
  return rules;
}
