import {URBAN_METRICS,type UrbanMetric} from "./urbanPrecheck";
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
 if(!input.zone.trim()||!input.usage.trim())reasons.push("informe zona e uso");
 if(!validCivilDate(input.effectiveFrom))reasons.push("informe vigência válida");
 let proposedCount=0,missingReferences=0,invalidValues=0;
 for(const definition of URBAN_METRICS){
  const entry=input.draft[definition.key];
  if(!entry?.limit.trim()&&!entry?.reference.trim())continue;
  proposedCount++;
  const limit=entry?.limit.trim()??"";
  const number=Number(limit.replace(",","."));
  if(!/^\d{1,6}(?:[,.]\d{1,4})?$/.test(limit)||!Number.isFinite(number)||number<0)invalidValues++;
  if(!entry?.reference.trim())missingReferences++;
 }
 if(!proposedCount)reasons.push("informe pelo menos um índice");
 if(invalidValues)reasons.push(`${invalidValues} valor(es) inválido(s)`);
 if(missingReferences)reasons.push(`${missingReferences} referência(s) legais ainda vazias`);
 return {canSave:reasons.length===0,reasons,proposedCount,missingReferences,invalidValues};
}
