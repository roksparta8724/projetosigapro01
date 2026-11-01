import {type UrbanMetric} from "./urbanPrecheck";
import {isSingleUrbanZone,type UrbanLegalSourceContext} from "./urbanLegalEvidenceRegistration";

/** Only numeric and directionally compatible Quadro I fields can become
 * editable proposals. All others (CA minimum/basic, lot, frontage, gabarito,
 * legal exceptions, Quadro II) stay explicitly outside this mapping.
 * The draft must never be activated or saved without separate legal review.
 */
const MAPPING:ReadonlyArray<{sourceKey:string;metric:UrbanMetric;max:number}>= [
 {sourceKey:"recuo_frontal",metric:"front_setback_m",max:100000},
 {sourceKey:"recuo_fundos",metric:"rear_setback_m",max:100000},
 {sourceKey:"recuo_lateral",metric:"side_setback_m",max:100000},
 {sourceKey:"permeabilidade_minima",metric:"permeability_percent",max:100},
 {sourceKey:"ocupacao_maxima",metric:"occupancy_percent",max:100},
 {sourceKey:"ca_maximo",metric:"floor_area_ratio",max:100000},
];
export type UrbanPdfNumericProposal={
 metric:UrbanMetric;sourceKey:string;limit:string;sourceValue:string;
};
export function proposeUrbanRulesFromPdf(context:UrbanLegalSourceContext):UrbanPdfNumericProposal[]{
 if(!isSingleUrbanZone(context.zone)||!context.usage.trim()||!Number.isSafeInteger(context.physicalPage)||
   context.physicalPage<1||!Array.isArray(context.cells))return [];
 const used=new Set<string>();
 const proposed:UrbanPdfNumericProposal[]=[];
 for(const mapping of MAPPING){
  const matches=context.cells.filter(cell=>cell.key===mapping.sourceKey &&
    cell.status==="source_text" && typeof cell.value==="string");
  if(matches.length!==1||used.has(mapping.metric))continue;
  const text=matches[0].value!.trim();
  // No formulas, arithmetic, estimated units, or ambiguous fragmented cells.
  if(!/^\d{1,6}(?:[,.]\d{1,3})?$/.test(text))continue;
  const value=Number(text.replace(",","."));
  if(!Number.isFinite(value)||value<0||value>mapping.max)continue;
  used.add(mapping.metric);
  proposed.push({metric:mapping.metric,sourceKey:mapping.sourceKey,
    limit:String(value),sourceValue:text});
 }
 return proposed;
}
