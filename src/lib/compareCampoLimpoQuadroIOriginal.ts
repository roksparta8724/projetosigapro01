import type { UrbanMatrixBatchDetail } from "@/integrations/backend/urbanPrecheckClient";
import { CAMPO_LIMPO_QUADRO_I_ORIGINAL } from "@/lib/campoLimpoQuadroIOriginal";

export type OriginalQuadroIDifference = {
  ordinal: number;
  zone: string;
  use: string;
  field: string;
  original: string;
  imported: string;
};
export type OriginalQuadroIComparison = {
  hasSource: boolean;
  sourceRows: number;
  originalRows: number;
  comparedFields: number;
  differences: OriginalQuadroIDifference[];
  ambiguous: number[];
  scopeNotice: string;
};

const originalFields = [
  ["ca_minimo_original", "caMinimumLiteral", "CA mínimo"],
  ["ca_basico_original", "caBasicLiteral", "CA básico"],
  ["ca_maximo_original", "caMaximumLiteral", "CA máximo"],
  ["taxa_ocupacao_maxima_pct", "maximumOccupancyPercentLiteral", "Taxa de ocupação máxima"],
  ["taxa_permeabilidade_minima_pct", "minimumPermeabilityPercentLiteral", "Taxa de permeabilidade mínima"],
  ["lote_minimo_m2", "minimumParcelAreaM2Literal", "Lote mínimo"],
  ["testada_minima_m", "minimumFrontageMLiteral", "Testada mínima"],
  ["recuo_frontal_m", "frontSetbackMLiteral", "Recuo frontal"],
  ["recuo_fundos_m", "rearSetbackMLiteral", "Recuo fundos"],
  ["recuo_lateral_m", "lateralSetbackMLiteral", "Recuo lateral"],
] as const;

const nameKey = (s: unknown) => String(s ?? "").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR")
  .replace(/^ZONA\s+/, "").replace(/[^A-Z0-9]/g, "");
/**
 * Actual municipal staging labels may include the state suffix "- SP".
 * Accept only the specific municipality, not any string that happens to
 * contain "Campo Limpo Paulista" or any other city/state combination.
 */
function isCampoLimpoOriginalSource(label: unknown): boolean {
  const value = nameKey(label);
  return value === "CAMPOLIMPOPAULISTA" ||
    value === "CAMPOLIMPOPAULISTASP" ||
    value === "PREFEITURADECAMPOLIMPOPAULISTA" ||
    value === "PREFEITURAMUNICIPALDECAMPOLIMPOPAULISTA" ||
    value === "PREFEITURAMUNICIPALDECAMPOLIMPOPAULISTASP";
}
function asNumeric(s: unknown): number | null {
  if (typeof s !== "string" && typeof s !== "number") return null;
  const raw = String(s).trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Read-only documentary reconciliation. Matching OCR with the 2009 original
 * never proves a norm is currently in force or that its legal scope applies.
 */
export function compareCampoLimpoQuadroIOriginal(
  batch: UrbanMatrixBatchDetail | null,
): OriginalQuadroIComparison {
  const comparison: OriginalQuadroIComparison = {
    hasSource: Boolean(batch),
    sourceRows: batch?.source_rows.length ?? 0,
    originalRows: CAMPO_LIMPO_QUADRO_I_ORIGINAL.length,
    comparedFields: 0,
    differences: [],
    ambiguous: [22],
    scopeNotice: "Comparação com o Quadro I ORIGINAL de 2009, sem consolidação das alterações. Exige revisão jurídica antes de qualquer diagnóstico.",
  };
  if (!batch) return comparison;
  if (!isCampoLimpoOriginalSource(batch.source_municipality)) {
    comparison.differences.push({
      ordinal: 0, zone: "Município", use: "Origem documental",
      field: "Município do lote", original: "Campo Limpo Paulista",
      imported: String(batch.source_municipality || "não informado"),
    });
    return comparison;
  }
  if (batch.source_rows.length !== comparison.originalRows) {
    comparison.differences.push({
      ordinal: 0, zone: "Quadro I", use: "Estrutura",
      field: "Quantidade de linhas", original: String(comparison.originalRows),
      imported: String(batch.source_rows.length),
    });
    // Avoid false index alignment if the imported table is incomplete.
    return comparison;
  }

  CAMPO_LIMPO_QUADRO_I_ORIGINAL.forEach((original, index) => {
    const imported = batch.source_rows[index];
    const zone = imported?.zona_conforme_tabela;
    const use = imported?.uso_predominante_conforme_tabela;
    if (nameKey(zone) !== nameKey(original.zone) || nameKey(use) !== nameKey(original.use)) {
      comparison.differences.push({
        ordinal: original.ordinal, zone: original.zone, use: original.use,
        field: "Zona e uso na posição do Quadro I", original: original.zone + " / " + original.use,
        imported: String(zone || "?") + " / " + String(use || "?"),
      });
      return;
    }
    for (const [sourceKey, originalKey, label] of originalFields) {
      // The original "01" in AIU2 is ambiguous, never a numeric 1 or 0.1.
      if (original.ordinal === 22 && sourceKey === "ca_minimo_original") continue;
      const expected = asNumeric(original[originalKey]);
      const observed = asNumeric(imported[sourceKey]);
      if (expected === null) continue;
      comparison.comparedFields += 1;
      if (observed === null || Math.abs(expected - observed) > 1e-9) {
        comparison.differences.push({
          ordinal: original.ordinal, zone: original.zone, use: original.use,
          field: label, original: original[originalKey],
          imported: imported[sourceKey] === undefined || imported[sourceKey] === null ||
            imported[sourceKey] === "" ? "Não extraído" : String(imported[sourceKey]),
        });
      }
    }
  });
  return comparison;
}
