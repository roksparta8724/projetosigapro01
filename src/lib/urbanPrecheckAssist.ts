import type { UrbanMeasurement, UrbanMeasurements, UrbanMetric, UrbanPrecheckResult } from "@/lib/urbanPrecheck";

export type UrbanAreaKey = "lot" | "footprint" | "permeable" | "totalFloor";
export type UrbanAreaInputs = Partial<Record<UrbanAreaKey, UrbanMeasurement>>;
export type UrbanAreaDerivation = {
  measurements: UrbanMeasurements;
  warnings: string[];
};

function isValidArea(entry: UrbanMeasurement | undefined): entry is UrbanMeasurement {
  return Boolean(entry && Number.isFinite(entry.value) && entry.value >= 0 &&
    typeof entry.evidence === "string" && entry.evidence.trim().length >= 3);
}

/**
 * Only the submitted, documented areas are used. No area is extracted from
 * drawings or guessed by AI. Keep full precision for threshold comparison.
 */
export function deriveUrbanAreaMeasurements(inputs: UrbanAreaInputs): UrbanAreaDerivation {
  const measurements: UrbanMeasurements = {};
  const warnings: string[] = [];
  const lot = inputs.lot;

  if (!lot || !Number.isFinite(lot.value) || lot.value <= 0 || !isValidArea(lot)) {
    warnings.push("Informe área positiva do terreno e a prancha ou documento que a comprova.");
    return { measurements, warnings };
  }

  const mapping: Array<{
    source: UrbanAreaKey; metric: UrbanMetric; label: string; multiple: number;
  }> = [
    { source: "footprint", metric: "occupancy_percent", label: "projeção da edificação", multiple: 100 },
    { source: "permeable", metric: "permeability_percent", label: "área permeável", multiple: 100 },
    { source: "totalFloor", metric: "floor_area_ratio", label: "área construída computável", multiple: 1 },
  ];

  for (const item of mapping) {
    const area = inputs[item.source];
    if (!area) continue;
    if (!isValidArea(area)) {
      warnings.push("A " + item.label + " precisa de valor válido e origem documental.");
      continue;
    }
    if (item.source !== "totalFloor" && area.value > lot.value) {
      warnings.push("A " + item.label + " excede a área do terreno: confira as medidas antes de comparar.");
      continue;
    }
    const ratio = (area.value / lot.value) * item.multiple;
    if (!Number.isFinite(ratio)) {
      warnings.push("O cálculo da " + item.label + " resultou em número inválido: confira as áreas.");
      continue;
    }
    measurements[item.metric] = {
      value: ratio,
      evidence: ("Terreno: " + lot.evidence.trim() + "; " + item.label + ": " +
        area.evidence.trim() + ". Cálculo = " + area.value + " / " + lot.value +
        (item.multiple === 100 ? " × 100" : "")).slice(0, 500),
    };
  }
  return { measurements, warnings };
}

const clean = (s: string) => String(s).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();

/** Draft only. Never dispatch, issue a legal opinion or approve an application. */
export function buildUrbanReviewDraft(
  protocol: string,
  zone: string,
  usage: string,
  version: number,
  findings: UrbanPrecheckResult[],
): string {
  const alerts = findings.filter((f) => f.status === "attention");
  if (!alerts.length) return "";
  const lines = [
    "MINUTA INTERNA — PARA CONFERÊNCIA DO ANALISTA RESPONSÁVEL",
    "Este texto não constitui notificação, indeferimento ou parecer técnico definitivo.",
    "Processo: " + clean(protocol),
    "Zona / uso informado: " + clean(zone) + " / " + clean(usage),
    "Versão normativa consultada: " + version,
    "",
    "POSSÍVEIS DIVERGÊNCIAS A CONFERIR",
    ...alerts.map((f, i) => [
      String(i + 1) + ". " + clean(f.label),
      "Medida informada: " + f.observed + (f.unit ? " " + f.unit : "") +
      "; referência: " + (f.direction === "minimum" ? "mínimo " : "máximo ") +
      f.limit + (f.unit ? " " + f.unit : ""),
      "Base legal indicada: " + clean(f.reference),
      "Origem informada da medida: " + clean(f.evidence),
      "Providência sugerida: conferir o projeto, a modalidade e as exceções legais aplicáveis;",
      "caso a divergência seja confirmada, solicitar adequação ou justificativa técnica.",
    ].join("\n")),
    "",
    "Revisão obrigatória: verificar legislação, exceções, planta, escalas e documentos originais.",
    "Somente o servidor responsável poderá formalizar exigências pelo fluxo oficial do SIGAPRO.",
  ];
  return lines.join("\n\n");
}

/** Merge calculated values without overwriting an analyst's manual entry or source. */
export function mergeDerivedUrbanFields<T extends string>(
  current: Partial<Record<T, { value: string; evidence: string }>>,
  calculated: ReadonlyArray<readonly [T, { value: number; evidence: string }]>,
): Partial<Record<T, { value: string; evidence: string }>> {
  const next = { ...current };
  for (const [metric, measurement] of calculated) {
    if (!Number.isFinite(measurement.value) || measurement.value < 0 || !measurement.evidence.trim()) continue;
    if (next[metric]?.value.trim() || next[metric]?.evidence.trim()) continue;
    next[metric] = { value: String(measurement.value), evidence: measurement.evidence };
  }
  return next;
}

/** Reject nonexistent calendar dates before selecting a municipal regulation. */
export function isValidUrbanReferenceDate(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
