import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {extractProjectMeasures,type ProjectTextLine} from "@/lib/urbanArchitecturalMeasures";
describe("SIGAPRO QA: leitura documental de projeto real (candidato, não aprovação)",()=>{
 it("captura medidas declaradas em pranchas e mantém páginas exatas",()=>{
  const lines:ProjectTextLine[]=[
   {page:1,text:"RECUO FRONTAL: 5,00 m"},
   {page:1,text:"RECUO LATERAL = 1,50 m"},
   {page:2,text:"TAXA DE OCUPAÇÃO: 45,5 %"},
   {page:2,text:"TAXA DE PERMEABILIDADE = 22 %"},
   {page:3,text:"COEFICIENTE DE APROVEITAMENTO: 1,20"},
   {page:3,text:"NÚMERO DE PAVIMENTOS: 2"},
  ];
  const r=extractProjectMeasures(lines);
  expect(r.conflicts).toHaveLength(0);
  expect(Object.fromEntries(r.proposals.map(x=>[x.metric,x.value]))).toEqual({
   front_setback_m:5,side_setback_m:1.5,occupancy_percent:45.5,
   permeability_percent:22,floor_area_ratio:1.2,floor_count:2,
  });
  expect(r.proposals.find(x=>x.metric==="front_setback_m")?.page).toBe(1);
 });
 it("bloqueia divergências entre pranchas e não atribui medições legais como cotas",()=>{
  const r=extractProjectMeasures([
   {page:1,text:"RECUO FRONTAL: 5 m"},
   {page:2,text:"RECUO FRONTAL: 6 m"},
   {page:3,text:"RECUO LATERAL MÍNIMO: 2 m (legislação)"},
   {page:3,text:"TAXA DE OCUPAÇÃO MÁXIMA: 60 %"},
   {page:4,text:"Altura da edificação = largura da rua + recuo"},
  ]);
  expect(r.conflicts).toEqual([{metric:"front_setback_m",values:[5,6],pages:[1,2]}]);
  expect(r.proposals).toHaveLength(0);
 });
 it("calcula índices somente de áreas explícitas e unívocas e apresenta a fórmula",()=>{
  const r=extractProjectMeasures([
   {page:1,text:"Área total do terreno = 300,00 m²"},
   {page:2,text:"Área de projeção: 120 m²"},
   {page:2,text:"Área permeável: 90,00 m²"},
   {page:3,text:"Área construída computável: 180 m²"},
  ]);
  expect(Object.fromEntries(r.proposals.map(x=>[x.metric,x.value]))).toEqual({
   occupancy_percent:40,permeability_percent:30,floor_area_ratio:0.6,
  });
  expect(r.proposals.every(x=>x.origin==="derived")).toBe(true);
  expect(r.proposals.find(x=>x.metric==="floor_area_ratio")?.pages).toEqual([1,3]);
 });
 it("descarta percentuais impossíveis, fórmulas, ausência de unidades e áreas inconsistentes",()=>{
  const r=extractProjectMeasures([
   {page:1,text:"taxa de ocupacao: 150%"},
   {page:1,text:"recuo frontal: 5"},
   {page:1,text:"recuo lateral = 2 + largura via"},
   {page:1,text:"área terreno: 200 m²"},
   {page:2,text:"área terreno: 300 m²"},
   {page:2,text:"área de projeção: 80 m²"},
  ]);
  expect(r.proposals).toEqual([]);
 });
 it("não confunde milímetros ou índices legais com medições arquitetônicas",()=>{
  const review=extractProjectMeasures([
   {page:1,text:"RECUO FRONTAL: 5,00 mm"},
   {page:1,text:"RECUO FRONTAL MÍNIMO 10 m"},
   {page:2,text:"TAXA DE PERMEABILIDADE: 30 pontos"},
   {page:2,text:"ÁREA DO TERRENO: 200 mm2"},
  ]);
  expect(review.proposals).toHaveLength(0);
  expect(review.areaDeclarations).toHaveLength(0);
 });
 it("integra no analista, exige clique de confirmação e não envia PDF ao modelo",()=>{
  const ui=readFileSync("src/components/platform/UrbanProjectReaderPanel.tsx","utf8");
  const engine=readFileSync("src/lib/urbanProjectPdfReader.ts","utf8");
  const precheck=readFileSync("src/components/platform/UrbanPrecheckPanel.tsx","utf8");
  expect(ui).toContain('data-sigapro-real-project-pdf-reader="true"');
  expect(ui).toContain('data-urban-project-source-attested="true"');
  expect(ui).toContain('data-urban-project-apply-confirmed="true"');
  expect(ui).toContain("onConfirm(picked,");
  expect(ui).toContain('data-urban-project-saved-documents="true"');
  expect(ui).toContain('data-urban-inspect-saved-project="true"');
  expect(ui).toContain("getSignedUrlForObjectStrict");
  expect(ui).toContain("original.fileHash.toLowerCase()");
  expect(precheck).toContain("documents={process.documents}");
  expect(precheck).toContain("<UrbanProjectReaderPanel");
  expect(engine).toContain("isEvalSupported:false");
  expect(engine).toContain("SHA-256");
  expect(engine).not.toContain("fetch(");
  expect(engine).not.toContain("backendClient");
 });
});
