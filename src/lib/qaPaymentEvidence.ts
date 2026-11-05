/**
 * A QA-only synthetic guide must never be presented as real bank reconciliation.
 * Does not mutate payment state or change dispatch authorization.
 */
export function isSyntheticQaProtocolGuideCode(code:unknown):boolean{
  return typeof code==="string" &&
    /^QA-FICTICIA-SEM-COBRANCA(?:-|$)/i.test(code.trim());
}

export function protocolPaymentEvidenceLabel(
  guide:{code?:string;status?:string}|null|undefined,
):string{
  if(isSyntheticQaProtocolGuideCode(guide?.code))
    return "Simulação QA — sem pagamento bancário";
  return guide?.status==="compensada"?"Confirmado":"Pendente";
}
