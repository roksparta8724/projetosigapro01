/** SIGAPRO: legal PDF assistance; never activates rules or establishes compliance. */
import { URBAN_METRICS, type UrbanMetric } from "@/lib/urbanPrecheck";

export type UrbanLegalEvidence = {
  id: string; evidence_id: string; municipality_id: string; document_title: string;
  document_sha256: string; page_number: number; metric: UrbanMetric;
  excerpt: string; zone_code: string; use_code: string;
  effective_from: string; effective_until: string | null;
  verification_method?: "text_layer_verified" | "visual_double_transcription"; created_at: string;
};
export type UrbanLegalSuggestion = {
  metric: UrbanMetric; label: string; page: number; excerpt: string;
  suggestedLimit: number | null; uncertainty: string;
};

const TERMS: Record<UrbanMetric, RegExp> = {
  front_setback_m: /\brecuo\s+(?:frontal|de\s+frente)\b/i,
  side_setback_m: /\brecuos?\s+latera(?:l|is)\b/i,
  rear_setback_m: /\brecuo\s+(?:de\s+fundos|posterior)\b/i,
  permeability_percent: /\b(?:taxa|[ií]ndice)\s+de\s+permeabilidade\b/i,
  occupancy_percent: /\btaxa\s+de\s+ocupa[cç][aã]o\b/i,
  floor_area_ratio: /\bcoeficiente\s+de\s+aproveitamento\b/i,
  height_m: /\b(?:altura\s+m[aá]xima|altura\s+permitida|gabarito\s+m[aá]ximo)\b/i,
  floor_count: /\b(?:n[uú]mero\s+de\s+)?pavimentos?\b/i,
};
const CONDITIONAL = /\b(exceto|salvo|quando|desde\s+que|poder[aá]|condicionado|conforme|dispensad[oa]s?|ressalvad[oa]s?|tabela|anexo|inciso)\b/i;
const MINIMUM = /\b(m[ií]nimo|m[ií]nima|no\s+m[ií]nimo)\b/i;
const MAXIMUM = /\b(m[aá]ximo|m[aá]xima|no\s+m[aá]ximo)\b/i;

const clean = (s: string) => String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

export function extractUrbanLegalSuggestions(
  pages: ReadonlyArray<{ page: number; text: string }>,
): UrbanLegalSuggestion[] {
  const output: UrbanLegalSuggestion[] = [];
  for (const page of pages.slice(0, 24)) {
    if (!Number.isInteger(page.page) || page.page < 1) continue;
    const text = String(page.text || "").slice(0, 3000);
    for (const definition of URBAN_METRICS) {
      const match = TERMS[definition.key].exec(text);
      if (!match) continue;
      const excerpt = clean(text.slice(Math.max(0, match.index - 75),
        Math.min(text.length, match.index + match[0].length + 180))).slice(0, 300);
      if (excerpt.length < 15) continue;
      const after = clean(text.slice(match.index + match[0].length, match.index + match[0].length + 85))
        .split(/;|\.(?!\d)/,1)[0];
      const direction = definition.direction === "minimum" ? MINIMUM : MAXIMUM;
      // An explicit directed number only, immediately following the metric.
      // Unqualified numbers, conditional cases and references to tables are manual.
      const result = after.match(/^\s*(?::|[-–])?\s*(?:no\s+)?(?:m[ií]nim[oa]|m[aá]xim[oa])\s*(?:de\s+)?(\d{1,3}(?:[.,]\d{1,3})?)\s*(%|m(?:etros?)?)?/i);
      const unit = result?.[2]?.toLowerCase() || "";
      const expected = definition.unit;
      const unitValid = expected === "%" ? unit === "%" :
        expected === "m" ? /^m(?:etros?)?$/.test(unit) : unit === "";
      const value = Number((result?.[1] || "").replace(",", "."));
      const allowed = Boolean(result && unitValid && direction.test(after) &&
        !CONDITIONAL.test(excerpt) && Number.isFinite(value) && value >= 0 &&
        (expected !== "%" || value <= 100) &&
        (definition.key !== "floor_count" || Number.isInteger(value)) &&
        value <= 500);
      output.push({
        metric: definition.key, label: definition.label, page: page.page, excerpt,
        suggestedLimit: allowed ? value : null,
        uncertainty: CONDITIONAL.test(excerpt)
          ? "Pode haver exceção, condição ou remissão legal: confirme o texto completo."
          : allowed
            ? "Número extraído como sugestão; confira zona, uso, vigência, exceções e unidade."
            : "Sem limite inequívoco: informe o valor somente após conferir a norma.",
      });
      if (output.length >= 60) return output;
    }
  }
  return output;
}

/** Manual evidence must originate in the actual PDF text layer, not a typed claim. */
export function excerptOccursOnPage(
  pages: ReadonlyArray<{page: number; text: string}>,
  pageNumber: number,
  excerpt: string,
): boolean {
  const needle = clean(excerpt);
  if (needle.length < 15 || needle.length > 500) return false;
  const page = pages.find(p => p.page === pageNumber);
  return Boolean(page && clean(page.text).includes(needle));
}

export function validateLegalEvidenceDraft(value: {
  title: string; hash: string; page: number; metric: string; excerpt: string;
}): void {
  if (!value.title.trim() || value.title.length > 180) throw new Error("Título da norma inválido (máximo 180 caracteres).");
  if (!/^[a-f0-9]{64}$/i.test(value.hash)) throw new Error("Documento sem SHA-256 verificável.");
  if (!Number.isSafeInteger(value.page) || value.page < 1 || value.page > 10000) throw new Error("Página da norma inválida.");
  if (!URBAN_METRICS.some(x => x.key === value.metric)) throw new Error("Parâmetro urbanístico inválido.");
  if (value.excerpt.trim().length < 15 || value.excerpt.length > 500) throw new Error("Trecho legal de 15 a 500 caracteres obrigatório.");
}

export function searchLegalEvidence(rows: readonly UrbanLegalEvidence[], term: string): UrbanLegalEvidence[] {
  const needle = clean(term).toLocaleLowerCase("pt-BR");
  if (!needle) return [...rows];
  return rows.filter(row =>
    (row.document_title + " " + row.excerpt + " " + row.metric + " " + row.page_number +
      " " + row.zone_code + " " + row.use_code + " " + row.effective_from)
      .toLocaleLowerCase("pt-BR").includes(needle));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Navegador sem verificação SHA-256.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}
