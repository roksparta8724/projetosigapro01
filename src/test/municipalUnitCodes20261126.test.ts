import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {suggestMunicipalUnitCode,isAdjunctUnit} from "@/lib/municipalUnitCodes";
describe("Organograma: criação de unidades e siglas",()=>{
 it("distingue titulares e adjuntos com acentos e nomes livres",()=>{
  expect(suggestMunicipalUnitCode("Secretaria Adjunta de Obras","secretaria",[])).toBe("SAD-OBR");
  expect(suggestMunicipalUnitCode("Diretoria Adjunta de Finanças","diretoria",[])).toBe("DAD-FIN");
  expect(suggestMunicipalUnitCode("Secretaria de Desenvolvimento Urbano","secretaria",[])).toBe("SEC-DU");
  expect(suggestMunicipalUnitCode("Assessoria Especial","unidade",[])).toBe("UNI-AE");
  expect(isAdjunctUnit("Secretário Adjunto de Obras")).toBe(true);
 });
 it("reserva siglas existentes e não altera a identificação atual",()=>{
  const rows=[{id:"1",code:"sad-obr"},{id:"2",code:"SAD-OBR2"}];
  expect(suggestMunicipalUnitCode("Secretaria Adjunta de Obras","secretaria",rows)).toBe("SAD-OBR3");
  expect(suggestMunicipalUnitCode("Secretaria Adjunta de Obras","secretaria",rows,"1")).toBe("SAD-OBR");
 });
 it("preserva permissões e confere unicidade e ciclos no banco",()=>{
  const sql=readFileSync("neon/migrations/20261126_zzzzzzzzzzzzzz_municipal_organogram_auto_codes_v1.sql","utf8");
  expect(sql).toContain("pg_advisory_xact_lock");
  expect(sql).toContain("WITH RECURSIVE ancestors");
  expect(sql).toContain("public.can_manage_municipality");
  expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE) public\.(profiles|tenant_memberships|municipal_authority_designations|municipal_staff_assignments)\b/i);
 });
});
