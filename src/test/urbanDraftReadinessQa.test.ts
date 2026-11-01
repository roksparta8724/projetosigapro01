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
 it("expõe as pendências na interface e remove referência fictícia",()=>{
  const file=readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx","utf8");
  expect(file).toContain('data-urban-draft-readiness="true"');
  expect(file).toContain("disabled={busy || loading || !draftReadiness.canSave}");
  expect(file).toContain("assessUrbanDraftReadiness({zone,usage,effectiveFrom,draft})");
  expect(file).not.toContain("Ex.: Lei 123/2026");
 });
});
