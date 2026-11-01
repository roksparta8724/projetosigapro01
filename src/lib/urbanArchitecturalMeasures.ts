/**
 * SIGAPRO — triagem de cotas declaradas em PDF de projeto.
 * NÃO mede geometria em pranchas, NÃO faz OCR nem aprova conformidade.
 * Cada candidato exige conferência humana da página original.
 */
import type {UrbanMetric} from "./urbanPrecheck";
export type ProjectTextLine={page:number;text:string};
export type ProjectMeasure={
 metric:UrbanMetric;value:number;page:number;excerpt:string;
 origin:"declared"|"derived";pages:number[];
};
export type ProjectMeasureConflict={
 metric:UrbanMetric;values:number[];pages:number[];
};
export type ProjectMeasurementReview={
 proposals:ProjectMeasure[];conflicts:ProjectMeasureConflict[];
 areaDeclarations:Array<{kind:AreaKind;value:number;page:number;excerpt:string}>;
};
type AreaKind="parcel"|"projection"|"permeable"|"computable";
type Rule={metric:UrbanMetric;pattern:RegExp;unit:"m"|"%"|"count"|"ratio"};
const RULES:Rule[]=[
 {metric:"front_setback_m",pattern:/\b(?:recuo|afastamento)\s+(?:de\s+)?frontal\b/i,unit:"m"},
 {metric:"side_setback_m",pattern:/\b(?:recuo|afastamento)\s+(?:de\s+)?lateral\b/i,unit:"m"},
 {metric:"rear_setback_m",pattern:/\b(?:recuo|afastamento)\s+(?:de\s+)?fundos?\b/i,unit:"m"},
 {metric:"occupancy_percent",pattern:/\b(?:taxa\s+de\s+ocupacao|t\.\s*o\.)\b/i,unit:"%"},
 {metric:"permeability_percent",pattern:/\b(?:taxa\s+de\s+permeabilidade|taxa\s+permeavel|t\.\s*p\.)\b/i,unit:"%"},
 {metric:"floor_area_ratio",pattern:/\b(?:coeficiente\s+de\s+aproveitamento|c\.\s*a\.)\b/i,unit:"ratio"},
 {metric:"height_m",pattern:/\b(?:altura\s+(?:total\s+)?da\s+edificacao|altura\s+construida)\b/i,unit:"m"},
 {metric:"floor_count",pattern:/\b(?:numero\s+de\s+pavimentos|quantidade\s+de\s+pavimentos|total\s+de\s+pavimentos)\b/i,unit:"count"},
];
const AREA_RULES:Array<{kind:AreaKind;pattern:RegExp}>=[
 {kind:"parcel",pattern:/\barea\s+(?:total\s+)?(?:do\s+)?terreno\b/i},
 {kind:"projection",pattern:/\barea\s+(?:de\s+)?projecao\b/i},
 {kind:"permeable",pattern:/\barea\s+permeavel\b/i},
 {kind:"computable",pattern:/\barea\s+(?:construida\s+)?computavel\b/i},
];
function normalized(value:string):string{
 return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
   .toLowerCase().replace(/\s+/g," ").trim();
}
function decimal(raw:string):number|null{
 const v=raw.replace(",",".");
 const value=Number(v);
 return Number.isFinite(value)&&value>=0&&value<=1000000?value:null;
}
const LEGAL_TERMS=/\b(?:minim[oa]s?|maxim[oa]s?|permitid[oa]s?|exigid[oa]s?|limite|obrigatori[oa]s?|legislac[aã]o|zoneamento|normativ[oa]s?)\b/i;
const PROJECT_NEGATIVE=/\b(?:exemplo|hipotetic[oa]|tabela\s+de\s+normas)\b/i;
function declaredMetric(line:string,rule:Rule):number|null{
 const found=rule.pattern.exec(line);
 if(!found)return null;
 const tail=line.slice(found.index+found[0].length);
 if(LEGAL_TERMS.test(tail)||LEGAL_TERMS.test(line.slice(0,found.index))||
  PROJECT_NEGATIVE.test(line))return null;
 const match=tail.match(/^\s*(?:[:=–-]\s*)?(\d{1,6}(?:[,.]\d{1,3})?)\s*(m²|m2|m\b|%|pavimentos?\b)?(?![a-z0-9])/i);
 if(!match)return null;
 const value=decimal(match[1]);
 if(value===null)return null;
 const unit=(match[2]||"").toLowerCase();
 if(rule.unit==="m"&&unit!=="m")return null;
 if(rule.unit==="%"&&(unit!=="%"||value>100))return null;
 if(rule.unit==="ratio"&&unit)return null;
 if(rule.unit==="count"&&(!Number.isInteger(value)||unit==="m"||unit==="%"))return null;
 if(rule.unit==="m"&&value>100000)return null;
 // A formula or missing units cannot be treated as a measurement.
 if(/^[\s]*(?:[+*\/]|x\s)/i.test(tail.slice(match[0].length)))return null;
 return value;
}
function declaredArea(line:string,kind:AreaKind,pattern:RegExp):number|null{
 const match=pattern.exec(line);
 if(!match||LEGAL_TERMS.test(line))return null;
 const tail=line.slice(match.index+match[0].length);
 const value=tail.match(/^\s*(?:[:=–-]\s*)?(\d{1,7}(?:[,.]\d{1,3})?)\s*(m²|m2)(?![a-z0-9])/i);
 return value?decimal(value[1]):null;
}
const nearly=(a:number,b:number)=>Math.abs(a-b)<Math.max(0.000001,Math.min(a,b)*0.000001);
export function extractProjectMeasures(lines:readonly ProjectTextLine[]):ProjectMeasurementReview{
 const discovered:ProjectMeasure[]=[];
 const areas:ProjectMeasurementReview["areaDeclarations"]=[];
 for(const source of lines){
  if(!Number.isSafeInteger(source.page)||source.page<1||source.text.length>3000)continue;
  const text=normalized(source.text);
  if(text.length<5||text.length>550)continue;
  for(const rule of RULES){
   const value=declaredMetric(text,rule);
   if(value!==null)discovered.push({metric:rule.metric,value,page:source.page,
      excerpt:source.text.trim().slice(0,240),origin:"declared",pages:[source.page]});
  }
  for(const {kind,pattern} of AREA_RULES){
   const value=declaredArea(text,kind,pattern);
   if(value!==null&&value>0)areas.push({kind,value,page:source.page,excerpt:source.text.trim().slice(0,240)});
  }
 }
 // Area ratios are candidates only if exactly ONE unambiguous declaration of
 // both numerator and parcel exists; derived ratios still require human review.
 const uniqueArea=(kind:AreaKind)=>{
  const all=areas.filter(item=>item.kind===kind);
  if(all.length===0||all.some(a=>!nearly(a.value,all[0].value)))return null;
  return all[0];
 };
 const parcel=uniqueArea("parcel");
 if(parcel){
  const derive=(kind:AreaKind,metric:UrbanMetric,factor:number)=>{
   const numerator=uniqueArea(kind);
   if(!numerator)return;
   const ratio=numerator.value/parcel.value*factor;
   if(!Number.isFinite(ratio)||ratio<0||ratio>(factor===100?100:100000))return;
   discovered.push({metric,value:Math.round(ratio*10000)/10000,
    page:numerator.page,pages:[parcel.page,numerator.page],
    excerpt:`Cálculo preliminar: ${kind} ${numerator.value} m² (p. ${numerator.page}) ÷ terreno ${parcel.value} m² (p. ${parcel.page}) × ${factor}. Conferir conceitos legais e áreas computáveis.`,
    origin:"derived"});
  };
  derive("projection","occupancy_percent",100);
  derive("permeable","permeability_percent",100);
  derive("computable","floor_area_ratio",1);
 }
 const proposals:ProjectMeasure[]=[];
 const conflicts:ProjectMeasureConflict[]=[];
 for(const rule of RULES){
  const matches=discovered.filter(item=>item.metric===rule.metric);
  if(!matches.length)continue;
  const unique=[...new Set(matches.map(x=>x.value))];
  if(unique.length>1){
   conflicts.push({metric:rule.metric,values:unique,pages:[...new Set(matches.flatMap(m=>m.pages))].sort((a,b)=>a-b)});
  }else{
   // If derived and explicit declarations agree, prefer literal with page.
   const literal=matches.find(m=>m.origin==="declared")||matches[0];
   proposals.push(literal);
  }
 }
 return {proposals,conflicts,areaDeclarations:areas};
}
