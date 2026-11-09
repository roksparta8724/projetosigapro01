/**
 * A QA-only synthetic guide must never be presented as real bank reconciliation.
 * Does not mutate payment state or change dispatch authorization.
 */
export function isSyntheticQaProtocolGuideCode(code:unknown):boolean{
  return typeof code==="string" &&
    /^QA-FICTICIA-SEM-COBRANCA(?:-|$)/i.test(code.trim());
}

export function protocolPaymentEvidenceLabel(
  guide:{code?:string;status?:string;bankStatus?:string|null;
    providerEnvironment?:string|null}|null|undefined,
):string{
  if(isFinancialTestGuide(guide))
    return "Simulação QA — sem pagamento bancário";
  return guide?.status==="compensada"?"Confirmado":"Pendente";
}

/**
 * Test-mode charges never represent real municipal revenue. The classifier is
 * display/reporting only: it must NOT change triage, settlement, or bank state.
 */
export type FinancialGuideEvidence = {
  code?:string|null;
  status?:string|null;
  bankStatus?:string|null;
  providerEnvironment?:string|null;
  amount?:number|null;
};
export function isFinancialTestGuide(guide:FinancialGuideEvidence|null|undefined):boolean{
  if(!guide)return false;
  return isSyntheticQaProtocolGuideCode(guide.code)||
    guide.bankStatus==="QA_SYNTHETIC_NOT_BANK_PAID"||
    guide.bankStatus==="QA_FIXTURE_NOT_BANK_PAID"||
    guide.providerEnvironment==="test";
}
export function isReportedCompensatedGuide(guide:FinancialGuideEvidence|null|undefined):boolean{
  return guide?.status==="compensada"&&!isFinancialTestGuide(guide);
}
export function guideFinancialEvidenceLabel(guide:FinancialGuideEvidence|null|undefined):string{
  if(isFinancialTestGuide(guide))return "Simulação QA — sem arrecadação real";
  return guide?.status==="compensada"?"Compensada no sistema":"Pendente";
}

/** One non-mutating financial ledger view shared by every dashboard. */
export function summarizeFinancialGuideEvidence<T extends FinancialGuideEvidence>(
  guides:readonly T[],
){
  const actual=guides.filter(guide=>!isFinancialTestGuide(guide));
  const synthetic=guides.filter(isFinancialTestGuide);
  const pending=actual.filter(guide=>guide.status==="pendente");
  const compensated=actual.filter(guide=>guide.status==="compensada");
  const amount=(guide:T)=>typeof guide.amount==="number"&&
    Number.isFinite(guide.amount)&&guide.amount>=0?guide.amount:0;
  return {
    actual,synthetic,pending,compensated,
    issuedCount:actual.length,pendingCount:pending.length,
    compensatedCount:compensated.length,
    issuedAmount:actual.reduce((sum,guide)=>sum+amount(guide),0),
    pendingAmount:pending.reduce((sum,guide)=>sum+amount(guide),0),
    compensatedAmount:compensated.reduce((sum,guide)=>sum+amount(guide),0),
  };
}
