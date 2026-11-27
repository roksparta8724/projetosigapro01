import { describe,it,expect } from "vitest";
import { findMunicipalUnitNameConflict,suggestDistinctMunicipalUnitName,municipalUnitSaveError } from "@/lib/municipalUnitName";
const units=[{id:"sea",code:"SEA",name:"Desenvolvimento Urbano",isActive:true},{id:"urb",code:"URB",name:"Urbanismo e Obras",isActive:true},{id:"old",code:"OLD",name:"Secretaria de Obras",isActive:false}];
describe("Nomes de unidades municipais",()=>{
 it("encontra duplicidade ativa ou inativa, sem bloquear a própria unidade",()=>{
  expect(findMunicipalUnitNameConflict(" desenvolvimento urbano ",units,"urb")?.id).toBe("sea");
  expect(findMunicipalUnitNameConflict("Desenvolvimento Urbano",units,"sea")).toBeUndefined();
  expect(findMunicipalUnitNameConflict("Secretaria de Obras",units)?.isActive).toBe(false);
 });
 it("sugere nome distinto sem editar outro registro",()=>{
  expect(suggestDistinctMunicipalUnitName("Desenvolvimento Urbano","secretaria",units,"urb",null,"URB")).toBe("Secretaria de Desenvolvimento Urbano");
  expect(suggestDistinctMunicipalUnitName("Secretaria de Obras","secretaria",units,"urb",null,"URB")).toBe("Secretaria de Obras (URB)");
 });
 it("não exibe a restrição SQL na interface",()=>{
  expect(municipalUnitSaveError('duplicate key value violates unique constraint "departments_municipality_id_name_key"')).toMatch(/Já existe uma unidade/);
  expect(municipalUnitSaveError("Já existe uma unidade ativa com o nome X.")).toBe("Já existe uma unidade ativa com o nome X.");
 });
});
