import {describe,it,expect} from "vitest";
import {examineBatchRows,checkedBatchIndexes,makeUrbanBatchStaging,type BatchUrbanRow} from "@/lib/urbanBatchReview";
const good:BatchUrbanRow={
 pagina_pdf:36,zona_conforme_tabela:"ZM-B(e)",uso_predominante_conforme_tabela:"comercial",
 ca_minimo_original:"0,05",ca_basico_original:"0,5",ca_maximo_original:"1",
 taxa_ocupacao_maxima_pct:50,taxa_permeabilidade_minima_pct:70,lote_minimo_m2:3000,testada_minima_m:30,
 gabarito_original:"largura da via da testada + recuo",recuo_frontal_m:10,recuo_fundos_m:8,
 recuo_lateral_m:5,observacoes_especificas:"",pendencias_de_leitura:""
};
const hash="a".repeat(64);
describe("SIGAPRO matriz completa — preparação segura sem autorizar regras",()=>{
 it("lida com 23 linhas de uma vez e marca somente elegíveis",()=>{
  const rows=Array.from({length:23},(_,i)=>({...good,pagina_pdf:36+i, zona_conforme_tabela:"ZM-"+i}));
  const status=examineBatchRows(rows);
  expect(status).toHaveLength(23);
  expect(status.every(x=>x.bulkEligible)).toBe(true);
  expect(checkedBatchIndexes([0,0,22,90,-1],status)).toEqual([0,22]);
  const result=makeUrbanBatchStaging({municipio:"Campo Limpo Paulista",arquivo_sha256:hash,
   nao_ativar_regras_automaticamente:true,quadro_I:rows},status.map(x=>x.index));
  expect(result._source_rows).toHaveLength(23);
  expect(result._reviewed_indexes).toHaveLength(23);
  expect(result._legal_status).toBe("pending_legal_review");
  expect(JSON.stringify(result)).not.toContain("activate_urban_regulation");
 });
 it("mantém pendências, exceções e duplicidades fora da seleção em lote",()=>{
  const rows=[good,{...good,pagina_pdf:37,zona_conforme_tabela:"ZR1",ca_minimo_original:null},
   {...good,pagina_pdf:38,zona_conforme_tabela:"ZR2",observacoes_especificas:"Recua em casos especiais"},
   {...good,pagina_pdf:39,zona_conforme_tabela:"ZR3",pendencias_de_leitura:"ver imagem"},
   {...good,pagina_pdf:40,zona_conforme_tabela:"ZM-B(e)",recuo_lateral_m:"Obs: consultar"}];
  const status=examineBatchRows(rows);
  expect(status.filter(x=>x.bulkEligible)).toHaveLength(0);
  expect(checkedBatchIndexes([0,1,2,3,4],status)).toEqual([]);
  expect(status[1].issues.join(" ")).toContain("Coeficiente");
  expect(status[2].issues.join(" ")).toContain("Exceções");
  expect(status[4].issues.join(" ")).toContain("lateral");
 });
 it("proíbe pacotes sem vínculo obrigatório ao PDF e nunca infere vigência",()=>{
  expect(()=>makeUrbanBatchStaging({municipio:"teste",arquivo_sha256:"bad",
   nao_ativar_regras_automaticamente:true,quadro_I:[good]},[])).toThrow();
  expect(makeUrbanBatchStaging({municipio:"teste",arquivo_sha256:hash,
   nao_ativar_regras_automaticamente:true,quadro_I:[good]},[0]))
    .not.toHaveProperty("_effective_from");
 });
});
