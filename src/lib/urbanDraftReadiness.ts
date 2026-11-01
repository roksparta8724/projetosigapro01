import {normalizeUrbanCode,URBAN_METRICS,type UrbanMetric} from "./urbanPrecheck";
import {isSingleUrbanZone} from "./urbanLegalEvidenceRegistration";
export type DraftEditableValue={limit:string;reference:string};
export type UrbanDraftReadiness={canSave:boolean;reasons:string[];proposedCount:number;missingReferences:number;invalidValues:number};
function validCivilDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+"T00:00:00Z");
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}
/** User-facing, fail-closed: authoritative validation remains in Neon.
 * A numeric suggestion without the official legal citation is NOT ready to save. */
export function assessUrbanDraftReadiness(input:{
 zone:string;usage:string;effectiveFrom:string;
 draft:Partial<Record<UrbanMetric,DraftEditableValue>>;
}):UrbanDraftReadiness{
 const reasons:string[]=[];
 if(!isSingleUrbanZone(input.zone))reasons.push("confirme um código de zona individual e válido");
 if(!/^[A-Z0-9][A-Z0-9_ -]{0,59}$/.test(normalizeUrbanCode(input.usage)))
  reasons.push("informe uma categoria de uso válida");
 if(!validCivilDate(input.effectiveFrom))reasons.push("informe vigência válida");
 let proposedCount=0,missingReferences=0,invalidValues=0;
 for(const definition of URBAN_METRICS){
  const entry=input.draft[definition.key];
  if(!entry?.limit.trim()&&!entry?.reference.trim())continue;
  proposedCount++;
  const limit=entry?.limit.trim()??"";
  const number=Number(limit.replace(",","."));
  const isPercentage=definition.key==="permeability_percent"||definition.key==="occupancy_percent";
  const isCount=definition.key==="floor_count";
  if(!/^\d{1,6}(?:[,.]\d{1,4})?$/.test(limit)||
    !Number.isFinite(number)||number<0||number>100000||
    (isPercentage&&number>100)||(isCount&&!Number.isInteger(number)))invalidValues++;
  if(!entry?.reference.trim()||entry.reference.trim().length<6||
    entry.reference.length>500)missingReferences++;
 }
 if(!proposedCount)reasons.push("informe pelo menos um índice");
 if(invalidValues)reasons.push(`${invalidValues} valor(es) inválido(s)`);
 if(missingReferences)reasons.push(`${missingReferences} referência(s) legais ausentes ou incompletas (mínimo 6 caracteres)`);
 return {canSave:reasons.length===0,reasons,proposedCount,missingReferences,invalidValues};
}
