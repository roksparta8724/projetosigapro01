import type { UrbanMatrixAnalystGuidance } from "@/integrations/backend/urbanPrecheckClient";

export type Aiu2ProvisionalCriterion = {
  metric: "floor_area_ratio_min";
  limit: 1;
  originalOcr: "01";
  pendingAuthority: "CONCIDADE";
  legallyValidated: false;
  autoApproves: false;
};
/** Only the original AIU(2) row may use this manual QA criterion. */
export function getAiu2ProvisionalCriterion(
  row: Record<string, unknown>, index: number, guide?: UrbanMatrixAnalystGuidance,
): Aiu2ProvisionalCriterion | null {
  if (!guide || index !== 21 || guide.row_index !== index ||
      row.quadro !== "I" || Number(row.pagina_pdf) !== 37 ||
      String(row.zona_conforme_tabela).trim().toUpperCase() !== "AIU(2)" ||
      (row.ca_minimo_original !== null && row.ca_minimo_original !== undefined) ||
      guide.field_code !== "ca_minimo_original" ||
      guide.status !== "pending_documentary_confirmation" ||
      guide.provisional_status !== "manual_only_pending_concidade" ||
      Number(guide.provisional_manual_value) !== 1 ||
      Number(guide.proposed_value) !== 1 || guide.original_ocr_text !== "01") return null;
  return { metric: "floor_area_ratio_min", limit: 1, originalOcr: "01",
    pendingAuthority: "CONCIDADE", legallyValidated: false, autoApproves: false };
}
export function compareAiu2Interim(
  criterion: Aiu2ProvisionalCriterion, input: string,
): "empty"|"invalid"|"meets_provisional"|"below_provisional" {
  const s=input.trim();
  if(!s) return "empty";
  if(!/^\d+(?:[,.]\d{1,5})?$/.test(s)) return "invalid";
  const n=Number(s.replace(",","."));
  if(!Number.isFinite(n)||n>100) return "invalid";
  return n>=criterion.limit?"meets_provisional":"below_provisional";
}
