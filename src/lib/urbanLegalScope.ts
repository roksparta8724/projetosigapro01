import { normalizeUrbanCode, type UrbanRegulationVersion } from "@/lib/urbanPrecheck";
import type { UrbanLegalEvidence } from "@/lib/urbanLegalKnowledge";

export type UrbanLegalScopeDraft = {
  zoneCode: string;
  useCode: string;
  effectiveFrom: string;
  effectiveUntil: string;
};
const DATE=/^\d{4}-\d{2}-\d{2}$/;

function legalDateValid(raw:string):boolean {
  if(!DATE.test(raw)) return false;
  const parsed=new Date(raw+"T00:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0,10)===raw;
}
export function validateUrbanLegalScope(draft:UrbanLegalScopeDraft):string|null {
  const zone=normalizeUrbanCode(draft.zoneCode);
  const use=normalizeUrbanCode(draft.useCode);
  if(!/^[A-Z0-9_-]{1,40}$/.test(zone) ||
     !/^[A-Z0-9_ -]{1,60}$/.test(use)) {
    return "Informe zona e categoria de uso verificáveis antes de confirmar a referência.";
  }
  if(!legalDateValid(draft.effectiveFrom) ||
      (draft.effectiveUntil && !legalDateValid(draft.effectiveUntil)) ||
      (draft.effectiveUntil && draft.effectiveUntil<draft.effectiveFrom)){
    return "Confira as datas reais de vigência da norma, incluindo eventual revogação.";
  }
  return null;
}

/** Applying one rule to a different zone, use or date is always forbidden. */
export function urbanLegalEvidenceAppliesTo(
  record:UrbanLegalEvidence,
  regulation:UrbanRegulationVersion|null,
  asOf:string,
):boolean {
  if(!regulation || !legalDateValid(asOf))return false;
  const { zone_code, use_code, effective_from, effective_until }=record;
  return record.municipality_id===regulation.municipality_id &&
    normalizeUrbanCode(zone_code||"")===normalizeUrbanCode(regulation.zone_code) &&
    normalizeUrbanCode(use_code||"")===normalizeUrbanCode(regulation.use_code) &&
    legalDateValid(effective_from||"") && effective_from<=asOf &&
    (effective_until==null || (legalDateValid(effective_until)&&asOf<=effective_until));
}


/** Scope of a candidate source must fit the ordinance draft under review. */
export function urbanLegalScopeMatchesDraft(
  evidence:UrbanLegalEvidence, draft:UrbanLegalScopeDraft,
):boolean {
  if(validateUrbanLegalScope(draft))return false;
  return normalizeUrbanCode(evidence.zone_code)===normalizeUrbanCode(draft.zoneCode) &&
    normalizeUrbanCode(evidence.use_code)===normalizeUrbanCode(draft.useCode) &&
    legalDateValid(evidence.effective_from) && evidence.effective_from<=draft.effectiveFrom &&
    (!evidence.effective_until || draft.effectiveFrom<=evidence.effective_until);
}
