import {describe,expect,it} from "vitest";
import {resolveMasterWorkspaceScope,masterWorkspaceSearch} from "@/lib/masterWorkspaceScope";
import {readFileSync} from "node:fs";
const page=readFileSync("src/pages/saas/MasterAdminPage.tsx","utf8");
describe("Master workspace continuity",()=>{
 it("keeps the municipality selected when navigating from clean registration back to organogram",()=>{
  const scope=resolveMasterWorkspaceScope("clp",[{id:"clp"}]);
  const draft=masterWorkspaceSearch("?secao=organograma&municipio=clp","cadastro",scope,"novo");
  expect(new URLSearchParams(draft).get("municipio")).toBe("clp");
  expect(new URLSearchParams(draft).has("modo")).toBe(false);
  const back=masterWorkspaceSearch(draft,"organograma",scope,"novo");
  expect(new URLSearchParams(back).get("municipio")).toBe("clp");
 });
 it("does not choose a different city on transient empty or changed catalog",()=>{
  expect(resolveMasterWorkspaceScope("clp",[])).toBe("clp");
  expect(resolveMasterWorkspaceScope("clp",[{id:"other"}])).toBe("clp");
  expect(resolveMasterWorkspaceScope("",[{id:"clp"}])).toBe("clp");
  expect(resolveMasterWorkspaceScope("",[{id:"clp"},{id:"other"}])).toBe("");
 });
 it("keeps explicit edit mode across refresh but not a new form or other tab",()=>{
  const edit=masterWorkspaceSearch("","cadastro","clp","editar");
  expect(new URLSearchParams(edit).get("modo")).toBe("editar");
  expect(new URLSearchParams(masterWorkspaceSearch(edit,"organograma","clp","editar")).has("modo")).toBe(false);
  expect(new URLSearchParams(masterWorkspaceSearch(edit,"cadastro","clp","novo")).has("modo")).toBe(false);
 });
 it("does not clear departments or force a scroll during creation navigation",()=>{
  const reset=page.slice(page.indexOf("const resetForNewInstitution"),page.indexOf("const openMasterSection"));
  expect(reset).not.toContain("setSelectedTenantId");
  expect(reset).not.toContain("setMasterDepartments");
  expect(reset).not.toContain("scrollIntoView");
  expect(page).toContain("Trocar Prefeitura");
 });
});
