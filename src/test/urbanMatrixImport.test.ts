import { describe,expect,it } from "vitest";
import {extractLiteralCandidates,validatedNumericRules,validateImportDate} from "@/lib/urbanMatrixImport";
const page = "ZM-ABC RECUO FRONTAL 7 metros, RECUO LATERAL 3 metros, USOS R1 são permitidos mediante avaliação prévia.";
describe("Importação SIGAPRO — propostas sempre com citação literal",()=>{
 it("accepts quoted numeric candidates in Quadro I",()=>{
  const a={candidates:[{kind:"numeric_index",metric:"front_setback_m",limit:7,rawValue:"7",source_excerpt:"ZM-ABC RECUO FRONTAL 7 metros, RECUO LATERAL 3 metros"}]};
  const r=extractLiteralCandidates(a,page,"I");
  expect(r).toHaveLength(1);expect(r[0].limit).toBe(7);
  expect(validatedNumericRules(r,"Fonte oficial Quadro I, página 36")).toEqual([
   expect.objectContaining({metric:"front_setback_m",limit:7})]);
 });
 it("rejects hallucinated citations, out-of-range values and false literal numbers",()=>{
  const x=[
   {kind:"numeric_index",metric:"front_setback_m",limit:7,rawValue:"7",source_excerpt:"Recuo 7 m conforme regra inventada no mapa"},
   {kind:"numeric_index",metric:"occupancy_percent",limit:140,rawValue:"7",source_excerpt:"ZM-ABC RECUO FRONTAL 7 metros, RECUO LATERAL 3 metros"},
   {kind:"numeric_index",metric:"side_setback_m",limit:3,rawValue:"123",source_excerpt:"ZM-ABC RECUO FRONTAL 7 metros, RECUO LATERAL 3 metros"},
   {kind:"numeric_index",metric:"unknown_metric",limit:10,rawValue:"7",source_excerpt:"ZM-ABC RECUO FRONTAL 7 metros, RECUO LATERAL 3 metros"},
  ];
  expect(extractLiteralCandidates({candidates:x},page,"I")).toEqual([]);
 });
 it("keeps Quadro II conditions separate and prevents fake numeric rules",()=>{
  const src="USOS R1 são permitidos mediante avaliação prévia em legislação específica da área urbanizada.";
  const a=extractLiteralCandidates({candidates:[
   {kind:"use_condition",note:"Uso residencial condicionado a avaliação prévia",source_excerpt:src},
   {kind:"numeric_index",metric:"front_setback_m",limit:7,rawValue:"7",source_excerpt:src},
  ]},src,"II");
  expect(a).toHaveLength(1);expect(a[0].kind).toBe("use_condition");
  expect(()=>validatedNumericRules(a,"Fonte Quadro II")).toThrow();
 });
 it("rejects impossible legal effective dates",()=>{
  expect(validateImportDate("2026-02-30")).toBe(false);
  expect(validateImportDate("2009-11-24")).toBe(true);
  expect(validateImportDate("")).toBe(false);
 });
});
