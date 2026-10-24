/**
 * SIGAPRO Urbanismo — advisory, deterministic pre-check.
 * Numeric input must be manually confirmed by the analyst. A passing check
 * NEVER implies municipal approval, legal validity or proof of drawing geometry.
 */
export const URBAN_METRICS = [
  { key: "front_setback_m", label: "Recuo frontal", unit: "m", direction: "minimum" },
  { key: "side_setback_m", label: "Recuo lateral", unit: "m", direction: "minimum" },
  { key: "rear_setback_m", label: "Recuo de fundos", unit: "m", direction: "minimum" },
  { key: "permeability_percent", label: "Taxa de permeabilidade", unit: "%", direction: "minimum" },
  { key: "occupancy_percent", label: "Taxa de ocupação", unit: "%", direction: "maximum" },
  { key: "floor_area_ratio", label: "Coeficiente de aproveitamento", unit: "", direction: "maximum" },
  { key: "height_m", label: "Altura da edificação", unit: "m", direction: "maximum" },
  { key: "floor_count", label: "Quantidade de pavimentos", unit: "", direction: "maximum" },
] as const;

export type UrbanMetric = (typeof URBAN_METRICS)[number]["key"];
export type UrbanRule = { metric: UrbanMetric; limit: number; reference: string };
export type UrbanMeasurement = { value: number; evidence: string };
export type UrbanMeasurements = Partial<Record<UrbanMetric, UrbanMeasurement>>;
export type UrbanRegulationVersion = {
  id: string;
  municipality_id: string;
  zone_code: string;
  use_code: string;
  effective_from: string;
  version: number;
  status: "draft" | "active" | "superseded";
  rules: UrbanRule[];
  created_at: string;
  activated_at?: string | null;
};
export type UrbanPrecheckResult = {
  metric: UrbanMetric;
  label: string;
  direction: "minimum" | "maximum";
  status: "within_limit" | "attention" | "missing_evidence";
  observed: number | null;
  limit: number;
  unit: string;
  reference: string;
  evidence: string;
};

const allowed = new Set<string>(URBAN_METRICS.map((x) => x.key));
export function normalizeUrbanCode(value: string): string {
  return value.normalize("NFKC").trim().toLocaleUpperCase("pt-BR");
}

export function validateUrbanRules(value: unknown): value is UrbanRule[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > URBAN_METRICS.length) return false;
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") return false;
    const rule = row as Partial<UrbanRule>;
    if (!allowed.has(String(rule.metric)) || seen.has(String(rule.metric))) return false;
    if (typeof rule.limit !== "number" || !Number.isFinite(rule.limit) || rule.limit < 0 || rule.limit > 100000) return false;
    if (typeof rule.reference !== "string" || rule.reference.trim().length < 6 || rule.reference.length > 500) return false;
    if ((rule.metric === "occupancy_percent" || rule.metric === "permeability_percent") && rule.limit > 100) return false;
    if (rule.metric === "floor_count" && !Number.isInteger(rule.limit)) return false;
    seen.add(String(rule.metric));
  }
  return true;
}

export function selectUrbanRegulation(
  versions: UrbanRegulationVersion[],
  municipalityId: string,
  zone: string,
  usage: string,
  asOf: string,
): UrbanRegulationVersion | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const matched = versions.filter((rule) =>
    rule.municipality_id === municipalityId &&
    // For past protocol dates the historically activated, now superseded
    // regulation remains the correct candidate. Drafts are never eligible.
    (rule.status === "active" || rule.status === "superseded") &&
    normalizeUrbanCode(rule.zone_code) === normalizeUrbanCode(zone) &&
    normalizeUrbanCode(rule.use_code) === normalizeUrbanCode(usage) &&
    rule.effective_from <= asOf &&
    validateUrbanRules(rule.rules),
  );
  matched.sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.version - a.version);
  return matched[0] || null;
}

export function evaluateUrbanPrecheck(
  rules: UrbanRule[],
  measurements: UrbanMeasurements,
): UrbanPrecheckResult[] {
  if (!validateUrbanRules(rules)) throw new Error("Parâmetros municipais inválidos ou sem fundamentação legal.");
  return rules.map((rule) => {
    const definition = URBAN_METRICS.find((item) => item.key === rule.metric)!;
    const item = measurements[rule.metric];
    const validValue = item && typeof item.value === "number" &&
      Number.isFinite(item.value) && item.value >= 0 &&
      (rule.metric !== "floor_count" || Number.isInteger(item.value));
    const evidence = typeof item?.evidence === "string" ? item.evidence.trim().slice(0, 500) : "";
    // A numeric value without an identified source is NOT proof of compliance.
    if (!validValue || evidence.length < 3) {
      return { metric: rule.metric, label: definition.label, direction: definition.direction,
        status: "missing_evidence", observed: validValue ? item.value : null,
        limit: rule.limit, unit: definition.unit, reference: rule.reference, evidence };
    }
    const withinLimit = definition.direction === "minimum"
      ? item.value >= rule.limit
      : item.value <= rule.limit;
    return { metric: rule.metric, label: definition.label, direction: definition.direction,
      status: withinLimit ? "within_limit" : "attention", observed: item.value,
      limit: rule.limit, unit: definition.unit, reference: rule.reference, evidence };
  });
}
