import { normalizeUrbanCode, type UrbanMetric } from "@/lib/urbanPrecheck";

export type PreparedUrbanMatrixDraft = {
  zone: string;
  usage: string;
  fields: Partial<Record<UrbanMetric, { limit: string; reference: string }>>;
  otherLegalFields: string[];
  warning: string;
};

function verifiedNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== "string" || !/^\d+(?:[.,]\d{1,5})?$/.test(raw.trim())) return null;
  const number = Number(raw.trim().replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function display(raw: unknown): string {
  return typeof raw === "number" || typeof raw === "string" ? String(raw).trim() : "";
}

/**
 * A human-verified reading can prefill a DRAFT, never save or activate it.
 * Conditions and nonnumeric source columns are deliberately kept as context,
 * rather than invented compliance thresholds.
 */
export function prepareUrbanRuleDraftFromReviewedRow(
  source: Record<string, unknown>, documentTitle: string, readingVerified: boolean,
): PreparedUrbanMatrixDraft | null {
  if (!readingVerified || source.quadro !== "I" ||
      display(source.pendencias_de_leitura) ||
      !/\.pdf$/i.test(documentTitle.trim())) return null;
  const zone = normalizeUrbanCode(display(source.zona_conforme_tabela));
  const usage = normalizeUrbanCode(display(source.uso_predominante_conforme_tabela));
  const page = Number(source.pagina_pdf);
  if (!zone || !usage || !Number.isInteger(page) || page < 1) return null;
  const notes = display(source.observacoes_especificas);
  const reference = (documentTitle.trim() + ", Quadro I, página " + page +
    ". Conferir artigo, vigência e ressalvas." + (notes ? " Observações: " + notes : "")).slice(0, 500);
  const fields: PreparedUrbanMatrixDraft["fields"] = {};
  const mapping: Array<[UrbanMetric, string]> = [
    ["front_setback_m","recuo_frontal_m"],
    ["side_setback_m","recuo_lateral_m"],
    ["rear_setback_m","recuo_fundos_m"],
    ["permeability_percent","taxa_permeabilidade_minima_pct"],
    ["occupancy_percent","taxa_ocupacao_maxima_pct"],
    ["floor_area_ratio","ca_maximo_original"],
    ["floor_area_ratio_min","ca_minimo_original"],
    ["lot_area_m2","lote_minimo_m2"],
    ["lot_frontage_m","testada_minima_m"],
  ];
  for (const [metric, key] of mapping) {
    const value = verifiedNumber(source[key]);
    if (value === null || (metric.endsWith("_percent") && value > 100)) continue;
    fields[metric] = { limit: String(value).replace(".", ","), reference };
  }
  const gabarito = display(source.gabarito_original);
  const floors = /^(\d+)\s+pavimentos?$/i.exec(gabarito);
  if (floors) fields.floor_count = {limit:floors[1],reference};
  if (!Object.keys(fields).length) return null;
  const otherLegalFields = [
    ["CA mínimo",source.ca_minimo_original],
    ["CA básico",source.ca_basico_original],
    ["Área mínima do lote (m²)",source.lote_minimo_m2],
    ["Testada mínima (m)",source.testada_minima_m],
    ["Gabarito/altura",source.gabarito_original],
    ["Ressalvas",source.observacoes_especificas],
  ].filter(([,value]) => display(value)).map(([label,value]) =>
    String(label) + ": " + display(value));
  return {
    zone: /(?:\se\s|,)/i.test(zone) ? "" : zone,
    usage, fields, otherLegalFields,
    warning: "Pré-preenchimento de RASCUNHO, sem aprovação legal. Confirme zona real, uso, vigência, fontes, artigo e exceções. Nenhuma regra foi ativada.",
  };
}
