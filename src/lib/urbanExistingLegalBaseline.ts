/** Snapshot of municipal work saved before the individual legal registry.
 * Read-only. Prepared readings do not become active, enforceable law.
 */
export type UrbanExistingLegalBaseline = {
  status:"available";
  municipalityId:string;
  documents:Array<{slot:string;name:string}>;
  quadroI:{sourceDocument:string;sourceSha256:string;rows:number;reviewed:number;needsCorrection:number;pending:number;legalStatus:"pending_legal_review"};
  quadroII:{pages:number;draftEntries:number;machineSuggestions:number;legalStatus:"draft_unverified"};
  activeRealRegulations:number;
  verifiedLegalScopes:number;
  automaticallyApproved:false;
  legalConformity:"not_evaluated";
};
export function verifiedUrbanBaseline(value:unknown,municipalityId:string):UrbanExistingLegalBaseline|null{
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const v=value as Partial<UrbanExistingLegalBaseline>;
  if(v.status!=="available"||v.municipalityId!==municipalityId||
    v.automaticallyApproved!==false||v.legalConformity!=="not_evaluated"||
    !Array.isArray(v.documents)||v.documents.length>4||
    v.documents.some(x=>!x||typeof x.name!=="string"||x.name.length>255||
      typeof x.slot!=="string"||!["uso_solo","zoneamento","plano_diretor","leis_complementares"].includes(x.slot))||
    !v.quadroI||!v.quadroII)return null;
  const counters=[v.quadroI.rows,v.quadroI.reviewed,v.quadroI.needsCorrection,
    v.quadroI.pending,v.quadroII.pages,v.quadroII.draftEntries,
    v.quadroII.machineSuggestions,v.activeRealRegulations,v.verifiedLegalScopes];
  if(counters.some(n=>!Number.isSafeInteger(n)||n < 0 || n > 100000)||
     v.quadroI.reviewed > v.quadroI.rows||
     v.quadroI.pending!==v.quadroI.rows-v.quadroI.reviewed||
     v.quadroI.legalStatus!=="pending_legal_review"||
     v.quadroII.legalStatus!=="draft_unverified")return null;
  return v as UrbanExistingLegalBaseline;
}
