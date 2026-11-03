import type { UrbanMatrixBatchDetail } from "@/integrations/backend/urbanPrecheckClient";

type MatrixRow = Record<string, unknown>;
export function formatUrbanMatrixSourceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Não confirmado";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "Exige conferência da fonte";
}
export function calculateUrbanMatrixBatchProgress(batch: UrbanMatrixBatchDetail) {
  const total = batch.source_rows.length;
  const reviewedSet = new Set(batch.reviewed_indexes.filter(
    (index): index is number => Number.isInteger(index) && index >= 0 && index < total,
  ));
  const rows = batch.source_rows.map((source, index) => ({
    index, source, readingReviewed: reviewedSet.has(index),
  }));
  return {
    total, reviewed: reviewedSet.size, pending: Math.max(0, total - reviewedSet.size),
    percentage: total === 0 ? 0 : Math.round(1000 * reviewedSet.size / total) / 10,
    rows: rows.sort((a, b) => Number(a.readingReviewed) - Number(b.readingReviewed) || a.index - b.index),
  };
}
export function describeUrbanMatrixRow(source: MatrixRow) {
  const value = (key: string) => source[key];
  return {
    zone: formatUrbanMatrixSourceValue(value("zona_conforme_tabela")),
    usage: formatUrbanMatrixSourceValue(value("uso_predominante_conforme_tabela")),
    quadro: formatUrbanMatrixSourceValue(value("quadro")),
    page: formatUrbanMatrixSourceValue(value("pagina_pdf")),
    notes: String(value("observacoes_especificas") || "").trim().slice(0,1400),
    pending: String(value("pendencias_de_leitura") || "").trim().slice(0,1400),
    metrics: [
      ["CA mínimo", "ca_minimo_original"],
      ["CA básico", "ca_basico_original"],
      ["CA máximo", "ca_maximo_original"],
      ["Taxa de ocupação máxima (%)", "taxa_ocupacao_maxima_pct"],
      ["Permeabilidade mínima (%)", "taxa_permeabilidade_minima_pct"],
      ["Área mínima do lote (m²)", "lote_minimo_m2"],
      ["Testada mínima (m)", "testada_minima_m"],
      ["Gabarito da tabela", "gabarito_original"],
      ["Recuo frontal (m)", "recuo_frontal_m"],
      ["Recuo lateral (m)", "recuo_lateral_m"],
      ["Recuo de fundos (m)", "recuo_fundos_m"],
    ].map(([label, key]) => ({ label, value: value(key) })),
  };
}
