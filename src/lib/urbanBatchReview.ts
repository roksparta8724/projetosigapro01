/** Quadro I historical rows are evidence, NOT active municipal rules. */
export type BatchUrbanRow={
 pagina_pdf:number;zona_conforme_tabela:string;uso_predominante_conforme_tabela:string;
 ca_minimo_original:string|null;ca_basico_original:string;ca_maximo_original:string;
 taxa_ocupacao_maxima_pct:number;taxa_permeabilidade_minima_pct:number;
 lote_minimo_m2:number;testada_minima_m:number;gabarito_original:string;
 recuo_frontal_m:number;recuo_fundos_m:number;recuo_lateral_m:number|string;
 observacoes_especificas:string;pendencias_de_leitura:string;
};
export type BatchUrbanPackage={
 municipio:string;arquivo_sha256:string;nao_ativar_regras_automaticamente:true;
 quadro_I:BatchUrbanRow[];
};
export type BatchRowStatus={index:number;page:number;zone:string;use:string;
 issues:string[];bulkEligible:boolean};
export const MAX_BATCH_ROWS=500;
const ref=(s:string)=>s.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toUpperCase().replace(/\s+/g," ");
const number=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const textNumber=(v:unknown)=>typeof v==="string"&&/^\d+(?:[,.]\d{1,3})?$/.test(v.trim());
export function examineBatchRows(rows:readonly BatchUrbanRow[]):BatchRowStatus[]{
 const duplicates=new Map<string,number>();
 for(const row of rows){
  const key=ref(row.zona_conforme_tabela)+"|"+ref(row.uso_predominante_conforme_tabela);
  duplicates.set(key,(duplicates.get(key)||0)+1);
 }
 return rows.map((row,index)=>{
  const issues:string[]=[];
  if(!Number.isSafeInteger(row.pagina_pdf)||row.pagina_pdf<1||row.pagina_pdf>10000)
   issues.push("Página do PDF inválida");
  if(!row.zona_conforme_tabela?.trim()||!row.uso_predominante_conforme_tabela?.trim())
   issues.push("Zona ou uso ausente");
  if(!textNumber(row.ca_minimo_original)||!textNumber(row.ca_basico_original)||!textNumber(row.ca_maximo_original))
   issues.push("Coeficiente de aproveitamento não numérico ou pendente");
  for(const [name,value] of [
   ["Ocupação",row.taxa_ocupacao_maxima_pct],["Permeabilidade",row.taxa_permeabilidade_minima_pct],
   ["Lote mínimo",row.lote_minimo_m2],["Testada mínima",row.testada_minima_m],
   ["Recuo frontal",row.recuo_frontal_m],["Recuo de fundos",row.recuo_fundos_m],
   ["Recuo lateral",row.recuo_lateral_m]
  ] as const){
   if(!number(value))issues.push(name+" exige conferência individual");
  }
  if(!row.gabarito_original?.trim())issues.push("Gabarito não informado");
  if(row.pendencias_de_leitura?.trim())issues.push("Leitura pendente: "+row.pendencias_de_leitura.slice(0,130));
  if(row.observacoes_especificas?.trim())issues.push("Exceções/observações precisam de análise específica");
  const key=ref(row.zona_conforme_tabela)+"|"+ref(row.uso_predominante_conforme_tabela);
  if((duplicates.get(key)||0)>1)issues.push("Zona/uso repetidos: conferir páginas e exceções");
  return {index,page:row.pagina_pdf,zone:row.zona_conforme_tabela,use:row.uso_predominante_conforme_tabela,
   issues,bulkEligible:issues.length===0};
 });
}
export function checkedBatchIndexes(indexes:readonly number[],statuses:readonly BatchRowStatus[]){
 const unique=new Set(indexes);
 return statuses.filter(row=>unique.has(row.index)&&row.bulkEligible).map(row=>row.index);
}
export function makeUrbanBatchStaging(
 pkg:BatchUrbanPackage,selected:readonly number[]
){
 if(!pkg||pkg.nao_ativar_regras_automaticamente!==true||
   !/^[0-9a-f]{64}$/.test(pkg.arquivo_sha256)||
   !Array.isArray(pkg.quadro_I)||pkg.quadro_I.length<1||pkg.quadro_I.length>MAX_BATCH_ROWS)
   throw Error("Pacote histórico incompatível");
 const statuses=examineBatchRows(pkg.quadro_I);
 const reviewed=checkedBatchIndexes(selected,statuses);
 // Persist original values as data and operator attestations as separate metadata.
 // No legal effective date is inferred, no numeric rules are constructed.
 return {
  _document_sha256:pkg.arquivo_sha256,
  _source_municipality:pkg.municipio.slice(0,120),
  _source_rows:pkg.quadro_I,
  _reviewed_indexes:reviewed,
  _legal_status:"pending_legal_review" as const,
 };
}
