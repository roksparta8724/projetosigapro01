import { URBAN_VISION_FIELDS, type UrbanVisionFieldKey } from "./urbanVisionStructured";
import { reconcileUrbanOcr, type OcrOriginalRow, type OcrFieldStatus } from "./urbanOcrReconciliation";

export type UrbanDiagnosticVerdict="agree"|"conflict"|"one_model_only"|"not_read";
export type UrbanDiagnosticRow={
 key:UrbanVisionFieldKey;label:string;primary:string|null;expert:string|null;
 verdict:UrbanDiagnosticVerdict;
};
function parseDraft(text:string):Map<string,string>{
 const result=new Map<string,string>();
 const allowed=new Map<string,string>(URBAN_VISION_FIELDS.map(([key,label])=>[label.toLocaleLowerCase("pt-BR"),key]));
 for(const line of text.split(/\r?\n/)){
  const index=line.indexOf(":");
  if(index<0)continue;
  const key=allowed.get(line.slice(0,index).trim().toLocaleLowerCase("pt-BR"));
  if(!key||result.has(key))continue;
  const value=line.slice(index+1).trim();
  if(value&&value!=="[ILEGÍVEL]"&&!/^null$/i.test(value))result.set(key,value);
 }
 return result;
}
function comparable(raw:string){
 const flat=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
   .replace(/\s+/g," ").trim();
 // Never round digits or infer units; only conservative lexical agreement.
 return /^\d+(?:[.,]\d+)?\s*(?:m2|m²|m|%)?$/.test(flat)
   ?flat.replace(",",".").replace(/\s+/g,""):flat;
}
export function compareUrbanVisionDrafts(primary:string,expert:string):UrbanDiagnosticRow[]{
 const a=parseDraft(primary),b=parseDraft(expert);
 return URBAN_VISION_FIELDS.map(([key,label])=>{
  const p=a.get(key)||null,e=b.get(key)||null;
  const verdict:UrbanDiagnosticVerdict=p&&e
    ?comparable(p)===comparable(e)?"agree":"conflict"
    :p||e?"one_model_only":"not_read";
  return {key,label,primary:p,expert:e,verdict};
 });
}

/**
 * A third line of EVIDENCE, not a legal source of truth.
 * Compare Gemma's individual suggestions to the SHA-256-associated archived
 * Quadro I row; preserve its exact original spelling and numeric values.
 * A match here proves only equality to an imported draft, never validity of
 * the municipality's current law or confirmation of the attached PDF image.
 */
export type UrbanHistoricalEvidence={
  key:UrbanVisionFieldKey;
  reference:string|null;
  read:string|null;
  status:OcrFieldStatus|"not_checked";
};
const originalKeyByVision:Partial<Record<UrbanVisionFieldKey,keyof OcrOriginalRow>>={
  ca_minimo:"ca_minimo_original",ca_basico:"ca_basico_original",
  ca_maximo:"ca_maximo_original",ocupacao_maxima:"taxa_ocupacao_maxima_pct",
  permeabilidade_minima:"taxa_permeabilidade_minima_pct",
  lote_minimo:"lote_minimo_m2",testada_minima:"testada_minima_m",
  gabarito:"gabarito_original",recuo_frontal:"recuo_frontal_m",
  recuo_fundos:"recuo_fundos_m",recuo_lateral:"recuo_lateral_m",
};
export function auditExpertAgainstArchivedRow(
  diagnostics:readonly UrbanDiagnosticRow[],row:OcrOriginalRow|null
):UrbanHistoricalEvidence[]{
  if(!row)return diagnostics.map(d=>({key:d.key,reference:null,read:d.expert,status:"not_checked" as const}));
  const expertText=diagnostics.map(d=>d.label+": "+(d.expert??"[ILEGÍVEL]")).join("\n");
  const audited=reconcileUrbanOcr(expertText,row);
  return diagnostics.map(d=>{
    const result=d.key==="zona"?audited.scope[0]
      :d.key==="uso"?audited.scope[1]
      :audited.fields.find(f=>f.key===originalKeyByVision[d.key]);
    const historic= d.key==="zona"?row.zona_conforme_tabela
      :d.key==="uso"?row.uso_predominante_conforme_tabela
      :originalKeyByVision[d.key]?row[originalKeyByVision[d.key]!]:null;
    const reference=historic===null||historic===undefined?"[NÃO INFORMADO]":String(historic);
    return {key:d.key,reference,read:d.expert,
      status:result?.status??"not_checked"};
  });
}
