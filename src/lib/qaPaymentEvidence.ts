export type NormalizedFinancialStatus="pendente"|"compensada"|"cancelada"|"desconhecida";
export function normalizeFinancialGuideStatus(value:unknown):NormalizedFinancialStatus{
 const s=typeof value==="string"?value.trim().toLocaleLowerCase("pt-BR"):"";
 if(["compensada","confirmed","paid"].includes(s))return "compensada";
 if(["pendente","pending","pagamento_pendente"].includes(s))return "pendente";
 if(["cancelada","cancelled","canceled"].includes(s))return "cancelada";
 return "desconhecida";
}
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
  const status=normalizeFinancialGuideStatus(guide?.status);
  return status==="compensada"?"Compensada no sistema":status==="pendente"?"Pendente":status==="cancelada"?"Cancelada":"Situação não verificada";
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
  /** Legacy internal flag alone never proves settlement from the provider. */
  paid?:boolean|null;
  bankReference?:string|null;
  bankPaymentId?:string|null;
  bankStatusDetail?:string|null;
  bankAuthenticatedAt?:string|null;
  paymentProvider?:string|null;
};
export function isFinancialTestGuide(guide:FinancialGuideEvidence|null|undefined):boolean{
  if(!guide)return false;
  return isSyntheticQaProtocolGuideCode(guide.code)||
    String(guide.bankStatus||"").trim().toUpperCase()==="QA_SYNTHETIC_NOT_BANK_PAID"||
    String(guide.bankStatus||"").trim().toUpperCase()==="QA_FIXTURE_NOT_BANK_PAID"||
    ["test","sandbox","qa","hml","homologacao","homologação","homologation"].includes(String(guide.providerEnvironment||"").trim().toLocaleLowerCase("pt-BR"));
}
export function isPendingFinancialGuide(guide:FinancialGuideEvidence|null|undefined):boolean{
  return !!guide&&!isFinancialTestGuide(guide)&&normalizeFinancialGuideStatus(guide.status)==="pendente";
}
export function isReportedCompensatedGuide(guide:FinancialGuideEvidence|null|undefined):boolean{
  return !!guide&&!isFinancialTestGuide(guide)&&normalizeFinancialGuideStatus(guide.status)==="compensada";
}
/**
 * Verified bank settlement is NOT interchangeable with `status=compensada`.
 * The production Mercado Pago Orders webhook checks an accredited transfer,
 * independent provider observation, original PDF and signed evidence.
 * Other providers must expose equivalent audited evidence before being counted.
 * This is a read-only accounting classifier, never a process authorization.
 */
export function isBankVerifiedFinancialGuide(guide:FinancialGuideEvidence|null|undefined):boolean{
  if(!guide||isFinancialTestGuide(guide)||
    normalizeFinancialGuideStatus(guide.status)!=="compensada")return false;
  const environment=String(guide.providerEnvironment||"").trim().toLowerCase();
  if(!["production","prod","live"].includes(environment))return false;
  if(guide.paymentProvider!=="mercado_pago"||
    String(guide.bankStatus||"").trim().toLowerCase()!=="processed"||
    String(guide.bankStatusDetail||"").trim().toLowerCase()!=="accredited")return false;
  if(!String(guide.bankReference||"").trim()||
    !String(guide.bankPaymentId||"").trim())return false;
  const verifiedAt=guide.bankAuthenticatedAt;
  return typeof verifiedAt==="string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(verifiedAt)&&
    Number.isFinite(Date.parse(verifiedAt));
}
export function guideFinancialEvidenceLabel(guide:FinancialGuideEvidence|null|undefined):string{
  if(isFinancialTestGuide(guide))return "Simulação QA — sem arrecadação real";
  if(isBankVerifiedFinancialGuide(guide))return "Liquidação bancária verificada";
  const status=normalizeFinancialGuideStatus(guide?.status);
  return status==="compensada"?"Compensada no sistema":status==="pendente"?"Pendente":status==="cancelada"?"Cancelada":"Situação não verificada";
}

/** One non-mutating financial ledger view shared by every dashboard. */
export function summarizeFinancialGuideEvidence<T extends FinancialGuideEvidence>(
  guides:readonly T[],
){
  const actual=guides.filter(guide=>!isFinancialTestGuide(guide));
  const synthetic=guides.filter(isFinancialTestGuide);
  const pending=actual.filter(isPendingFinancialGuide);
  const compensated=actual.filter(isReportedCompensatedGuide);
  const unknown=actual.filter(guide=>normalizeFinancialGuideStatus(guide.status)==="desconhecida");
  const bankVerified=compensated.filter(isBankVerifiedFinancialGuide);
  const unverifiedCompensated=compensated.filter(guide=>!isBankVerifiedFinancialGuide(guide));
  const amount=(guide:T)=>typeof guide.amount==="number"&&
    Number.isFinite(guide.amount)&&guide.amount>=0?guide.amount:0;
  return {
    actual,synthetic,pending,compensated,unknown,bankVerified,unverifiedCompensated,
    issuedCount:actual.length,pendingCount:pending.length,unknownCount:unknown.length,
    compensatedCount:compensated.length,
    bankVerifiedCount:bankVerified.length,
    unverifiedCompensatedCount:unverifiedCompensated.length,
    issuedAmount:actual.reduce((sum,guide)=>sum+amount(guide),0),
    pendingAmount:pending.reduce((sum,guide)=>sum+amount(guide),0),
    compensatedAmount:compensated.reduce((sum,guide)=>sum+amount(guide),0),
    bankVerifiedAmount:bankVerified.reduce((sum,guide)=>sum+amount(guide),0),
    unverifiedCompensatedAmount:unverifiedCompensated.reduce((sum,guide)=>sum+amount(guide),0),
  };
}
