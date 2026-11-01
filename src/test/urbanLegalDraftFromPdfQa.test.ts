import {describe,expect,it} from "vitest";
import {proposeUrbanRulesFromPdf} from "@/lib/urbanLegalDraftFromPdf";
import type {UrbanLegalSourceContext} from "@/lib/urbanLegalEvidenceRegistration";
const source:UrbanLegalSourceContext={
 file:{name:"quadros.pdf"} as File, physicalPage:36,zone:"ZM-B(e)",usage:"comercial",
 cells:[
  {key:"zona",value:"ZM-B(e)",status:"source_text"},
  {key:"uso",value:"comercial",status:"source_text"},
  {key:"ca_minimo",value:"0,05",status:"source_text"},
  {key:"ca_basico",value:"0,5",status:"source_text"},
  {key:"ca_maximo",value:"1",status:"source_text"},
  {key:"ocupacao_maxima",value:"50",status:"source_text"},
  {key:"permeabilidade_minima",value:"70",status:"source_text"},
  {key:"lote_minimo",value:"3000",status:"source_text"},
  {key:"testada_minima",value:"30",status:"source_text"},
  {key:"gabarito",value:"Largura da via + recuo",status:"source_text"},
  {key:"recuo_frontal",value:"10",status:"source_text"},
  {key:"recuo_fundos",value:"8",status:"source_text"},
  {key:"recuo_lateral",value:"5",status:"source_text"},
 ],
};
describe("SIGAPRO QA — pré-preenchimento seguro sem inventar vigência",()=>{
 it("propõe somente seis números com métrica e direção compatíveis",()=>{
  const draft=proposeUrbanRulesFromPdf(source);
  expect(draft).toHaveLength(6);
  expect(Object.fromEntries(draft.map(x=>[x.metric,x.limit]))).toEqual({
    front_setback_m:"10",rear_setback_m:"8",side_setback_m:"5",
    permeability_percent:"70",occupancy_percent:"50",floor_area_ratio:"1",
  });
  expect(draft.some(x=>["ca_minimo","ca_basico","lote_minimo","testada_minima","gabarito"].includes(x.sourceKey))).toBe(false);
 });
 it("descarta valores com fórmulas, células ambíguas e zonas compostas",()=>{
  const cells=source.cells!.map(c=>c.key==="recuo_frontal"?{...c,value:"10 + condicional"}:
    c.key==="ocupacao_maxima"?{...c,status:"ambiguous" as const}:c);
  expect(proposeUrbanRulesFromPdf({...source,cells}).map(x=>x.metric)).not.toContain("front_setback_m");
  expect(proposeUrbanRulesFromPdf({...source,cells}).map(x=>x.metric)).not.toContain("occupancy_percent");
  expect(proposeUrbanRulesFromPdf({...source,zone:"ZM-B3(A) e ZM-B3(B)"})).toEqual([]);
 });
 it("não converte vigência nem normas a partir de texto extraído",()=>{
  const r=proposeUrbanRulesFromPdf(source);
  expect(r.every(x=>Object.keys(x).sort().join(",")==="limit,metric,sourceKey,sourceValue")).toBe(true);
 });
});
