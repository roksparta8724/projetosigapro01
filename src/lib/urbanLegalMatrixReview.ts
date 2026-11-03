import type { UrbanMatrixAnalystGuidance, UrbanMatrixBatchDetail, UrbanMatrixRowReadingAudit } from "@/integrations/backend/urbanPrecheckClient";

type MatrixRow = Record<string, unknown>;
export function formatUrbanMatrixSourceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Não confirmado";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "Exige conferência da fonte";
}
export function calculateUrbanMatrixBatchProgress(
  batch: UrbanMatrixBatchDetail,
  rowReviews: UrbanMatrixRowReadingAudit[] = [],
) {
  const total = batch.source_rows.length;
  const legacyReviewed = new Set(batch.reviewed_indexes.filter(
    (index): index is number => Number.isInteger(index) && index >= 0 && index < total,
  ));
  // Newer, signed reviews override the original snapshot without mutating it.
  const latest = new Map<number, UrbanMatrixRowReadingAudit>();
  for (const entry of [...rowReviews].sort(
    (a, b) => (a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) * -1,
  )) {
    if (entry.batch_id !== batch.id || !Number.isInteger(entry.row_index) ||
        entry.row_index < 0 || entry.row_index >= total || latest.has(entry.row_index)) continue;
    latest.set(entry.row_index, entry);
  }
  const rows = batch.source_rows.map((source, index) => {
    const review = latest.get(index);
    return {
      index, source, review,
      readingReviewed: review ? review.action === "reading_verified" : legacyReviewed.has(index),
      needsCorrection: review?.action === "needs_correction",
    };
  });
  const reviewed = rows.filter((row) => row.readingReviewed).length;
  return {
    total, reviewed, pending: Math.max(0, total - reviewed),
    needsCorrection: rows.filter((row) => row.needsCorrection).length,
    percentage: total === 0 ? 0 : Math.round(1000 * reviewed / total) / 10,
    rows: rows.sort((a, b) => Number(a.readingReviewed) - Number(b.readingReviewed) || a.index - b.index),
  };
}
/** Analyst guidance is neither source OCR nor a legally validated regulation. */
export function describePendingAnalystCa(guidance?: UrbanMatrixAnalystGuidance) {
  if (!guidance || guidance.field_code !== "ca_minimo_original" ||
      guidance.status !== "pending_documentary_confirmation") return null;
  const value = Number(guidance.proposed_value);
  if (!Number.isFinite(value) || value < 0) return null;
  return {
    formatted: value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    sourceOcr: String(guidance.original_ocr_text || "ilegível").slice(0, 100),
    status: "Aguardando comprovação documental",
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
