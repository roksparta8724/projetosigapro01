/** Legal citations from the official municipal evidence catalog (not historical OCR). */
import {normalizeUrbanCode,validateUrbanRules,type UrbanMetric,type UrbanRegulationVersion} from "./urbanPrecheck";

export type UrbanVerifiedLegalSource = {
 id:string; evidence_id:string; municipality_id:string;
 document_title:string;document_sha256:string;page_number:number;
 metric:string;excerpt:string;zone_code:string;use_code:string;
 effective_from:string;effective_until:string|null;verification_method:string;
};
export type UrbanLegalProof={
 scopeId:string;documentTitle:string;page:number;excerpt:string;method:string;
};
export type UrbanLegalCoverage={
 status:"unavailable"|"missing"|"incomplete_catalog"|"ready";
 required:number;matched:number;missing:UrbanMetric[];
 sources:Partial<Record<UrbanMetric,UrbanLegalProof>>;
 evidenceIds:string[];
};
const SHA256=/^[a-f0-9]{64}$/i;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const methods=new Set(["text_layer_verified","visual_double_transcription","browser_ocr_human_verified"]);
const civilDate=(raw:unknown):raw is string=>{
 if(typeof raw!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw))return false;
 const d=new Date(raw+"T00:00:00Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===raw;
};
/** Read-only, fail-closed per-index coverage for the selected, active law version.
 * A valid page reference is not a decision about whether the law is still in force.
 */
export function resolveUrbanLegalCoverage(
 regulation:UrbanRegulationVersion|null,raw:unknown,municipalityId:string,asOf:string
):UrbanLegalCoverage{
 const unavailable:UrbanLegalCoverage={status:"unavailable",required:0,matched:0,missing:[],sources:{},evidenceIds:[]};
 if(!regulation||regulation.status!=="active"||regulation.municipality_id!==municipalityId||
   !civilDate(asOf)||!civilDate(regulation.effective_from)||
   regulation.effective_from>asOf||!validateUrbanRules(regulation.rules))return unavailable;
 const missing=regulation.rules.map(x=>x.metric);
 if(!Array.isArray(raw))return {...unavailable,status:"missing",required:missing.length,missing};
 if(raw.length>=250)return {...unavailable,status:"incomplete_catalog",required:missing.length,missing};
 const sources:UrbanLegalCoverage["sources"]={};
 for(const rule of regulation.rules){
  const scope=raw.find((x:unknown)=>{
   if(!x||typeof x!=="object"||Array.isArray(x))return false;
   const e=x as Record<string,unknown>;
   return e.municipality_id===municipalityId &&
     e.metric===rule.metric && UUID.test(String(e.id||"")) &&
     UUID.test(String(e.evidence_id||"")) &&
     SHA256.test(String(e.document_sha256||"")) &&
     typeof e.document_title==="string" && e.document_title.trim().length>=4 &&
     Number.isSafeInteger(e.page_number) && Number(e.page_number)>0 &&
     typeof e.excerpt==="string" && e.excerpt.trim().length>=8 &&
     methods.has(String(e.verification_method||"")) &&
     normalizeUrbanCode(String(e.zone_code||""))===normalizeUrbanCode(regulation.zone_code) &&
     normalizeUrbanCode(String(e.use_code||""))===normalizeUrbanCode(regulation.use_code) &&
     civilDate(e.effective_from) && e.effective_from<=asOf &&
     (e.effective_until===null||e.effective_until===undefined||
       (civilDate(e.effective_until)&&e.effective_until>=asOf));
  }) as UrbanVerifiedLegalSource|undefined;
  if(scope)sources[rule.metric]={
    scopeId:scope.id,documentTitle:scope.document_title,page:scope.page_number,
    excerpt:scope.excerpt.slice(0,500),method:scope.verification_method,
  };
 }
 const uncovered=missing.filter(metric=>!sources[metric]);
 const evidenceIds=[...new Set(regulation.rules.flatMap(x=>sources[x.metric]?[sources[x.metric]!.scopeId]:[]))];
 return {status:uncovered.length?"missing":"ready",
  required:missing.length,matched:missing.length-uncovered.length,missing:uncovered,sources,evidenceIds};
}
