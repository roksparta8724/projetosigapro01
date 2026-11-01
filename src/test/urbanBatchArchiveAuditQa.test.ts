import {describe,expect,it} from "vitest";
import {auditArchivedUrbanBatch,type BatchUrbanRow} from "@/lib/urbanBatchReview";

const base:BatchUrbanRow={
 pagina_pdf:36,zona_conforme_tabela:"ZM-B(e)",
 uso_predominante_conforme_tabela:"comercial",
 ca_minimo_original:"0,05",ca_basico_original:"0,5",ca_maximo_original:"1",
 taxa_ocupacao_maxima_pct:50,taxa_permeabilidade_minima_pct:70,
 lote_minimo_m2:3000,testada_minima_m:30,gabarito_original:"Largura da via + recuo",
 recuo_frontal_m:10,recuo_fundos_m:8,recuo_lateral_m:5,
 observacoes_especificas:"",pendencias_de_leitura:"",
};
describe("SIGAPRO QA — integridade de conferência do lote histórico",()=>{
 it("preserva marcação anterior, isolando observações e valores ilegíveis",()=>{
  const rows:BatchUrbanRow[]=[base,
   {...base,zona_conforme_tabela:"ZM-MA(1,2,3,4)",uso_predominante_conforme_tabela:"residencial",
    observacoes_especificas:"recuo único: confirmar notas"},
   {...base,pagina_pdf:37,zona_conforme_tabela:"AIU(2)",uso_predominante_conforme_tabela:"misto",
    ca_minimo_original:null,pendencias_de_leitura:"C.A. mínimo ilegível"}];
  const report=auditArchivedUrbanBatch(rows,[0]);
  expect(report).toMatchObject({total:3,attested:1,pending:2,invalidIndexes:[]});
  expect(report.unresolved.map(x=>x.index)).toEqual([1,2]);
  expect(report.unresolved[0].issues.join(" ")).toContain("Exceções/observações");
  expect(report.unresolved[1].issues.join(" ")).toContain("Leitura pendente");
 });
 it("detecta marcação repetida, índice inexistente ou linha especial",()=>{
  const rows=[base,{...base,zona_conforme_tabela:"ZM-MA",observacoes_especificas:"exceção"}];
  const result=auditArchivedUrbanBatch(rows,[0,0,1,9,-1,1.5]);
  expect(result.attested).toBe(1);
  expect(result.pending).toBe(1);
  expect(result.invalidIndexes).toEqual([0,1,9,-1,1.5]);
 });
 it("não confunde marcação com norma ativada",()=>{
  const result=auditArchivedUrbanBatch([base],[0]);
  expect(result.attested).toBe(1);
  expect(result.pending).toBe(0);
  expect(Object.keys(result)).not.toContain("activated");
 });
});
