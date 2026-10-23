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
    measurements[item.metric] = {
      value: (area.value / lot.value) * item.multiple,
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
