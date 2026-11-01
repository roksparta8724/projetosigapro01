import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {assessUrbanDraftReadiness} from "@/lib/urbanDraftReadiness";
const source={
 zone:"ZM-B(E)",usage:"COMERCIAL",effectiveFrom:"",
 draft:{
  front_setback_m:{limit:"10",reference:""},
  rear_setback_m:{limit:"8",reference:""},
  side_setback_m:{limit:"5",reference:""},
  permeability_percent:{limit:"70",reference:""},
  occupancy_percent:{limit:"50",reference:""},
  floor_area_ratio:{limit:"1",reference:""},
 },
};
describe("SIGAPRO — não permite gravar sugestão sem fundamentação",()=>{
 it("preserva seis números da leitura, com botão bloqueado sem vigência e fontes",()=>{
  const a=assessUrbanDraftReadiness(source);
  expect(a).toMatchObject({canSave:false,proposedCount:6,missingReferences:6});
  expect(a.reasons.join(" ")).toMatch(/vigência/);
 });
 it("permite o estado de rascunho apenas com data e referências preenchidas",()=>{
  const draft=Object.fromEntries(Object.entries(source.draft).map(([key,val])=>
    [key,{...val,reference:"Lei oficial conferida, Quadro I, página 36"}]));
  expect(assessUrbanDraftReadiness({...source,effectiveFrom:"2025-01-01",draft}).canSave).toBe(true);
 });
 it("bloqueia datas impossíveis, fórmulas e valores inadequados",()=>{
  expect(assessUrbanDraftReadiness({...source,effectiveFrom:"2026-02-30"}).canSave).toBe(false);
  const draft={...source.draft,front_setback_m:{limit:"largura da via + recuo",reference:"Quadro I"}};
  expect(assessUrbanDraftReadiness({...source,draft,effectiveFrom:"2026-11-01"}).invalidValues).toBe(1);
 });
 it("bloqueia percentuais acima de 100%, pavimentos fracionados, índices acima do teto e referências insuficientes",()=>{
  const ref="Lei municipal conferida, Quadro I, página 36";
  const valid=Object.fromEntries(Object.entries(source.draft).map(([k,v])=>[k,{...v,reference:ref}]));
  const complete={...source,effectiveFrom:"2025-01-01",draft:valid};
  expect(assessUrbanDraftReadiness({...complete,draft:{
    ...valid,occupancy_percent:{limit:"101",reference:ref},
  }}).invalidValues).toBe(1);
  expect(assessUrbanDraftReadiness({...complete,draft:{
    ...valid,front_setback_m:{limit:"100001",reference:ref},
  }}).invalidValues).toBe(1);
  expect(assessUrbanDraftReadiness({...complete,draft:{
    ...valid,floor_count:{limit:"2,5",reference:ref},
  }}).invalidValues).toBe(1);
  expect(assessUrbanDraftReadiness({...complete,draft:{
    ...valid,front_setback_m:{limit:"10",reference:"Art"},
  }}).missingReferences).toBe(1);
  expect(assessUrbanDraftReadiness({...complete,zone:"ZM-B3(A) e ZM-B3(B)"}).canSave).toBe(false);
 });
 it("expõe as pendências na interface e remove referência fictícia",()=>{
  const file=readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx","utf8");
  expect(file).toContain('data-urban-draft-readiness="true"');
  expect(file).toContain("disabled={busy || loading || !draftReadiness.canSave}");
  expect(file).toContain("assessUrbanDraftReadiness({zone,usage,effectiveFrom,draft})");
  expect(file).not.toContain("Ex.: Lei 123/2026");
  expect(file).toContain('data-urban-source-provenance="true"');
  expect(file).toContain('data-urban-qa-law-baseline="true"');
  expect(file).toContain("Preencha a vigência e as referências para salvar");
  const css=readFileSync("src/index.css","utf8");
  expect(css).toContain('button[data-sigapro-urban-rules-save="true"]:disabled');
  expect(css).toContain("cursor:not-allowed !important;");
 });
});
