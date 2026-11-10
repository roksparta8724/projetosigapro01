import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const detail=readFileSync("src/pages/saas/ProcessDetailPage.tsx","utf8");
const action=detail.slice(detail.indexOf("const handleDispatchSubmit = async"),
 detail.indexOf("const updateTransitVisibility =",detail.indexOf("const handleDispatchSubmit = async")));

describe("SIGAPRO — administrador municipal é somente consulta em TODO processo",()=>{
 it("nunca usa override que burlaria a proteção de encaminhamento",()=>{
  expect(action).toContain('session.role === "prefeitura_admin"');
  expect(action).toContain("não encaminhar ou modificar processos");
  expect(action).not.toContain("allowMunicipalAdmin: true");
  expect(action).toContain("dispatchProcess({");
 });
 it("não exibe formulário operacional ao admin e informa claramente a regra",()=>{
  expect(detail).toContain('isInternalRole(session.role) && session.role !== "prefeitura_admin" && ownsCurrentProcessStage');
  expect(detail).toContain("O Administrador acompanha o processo em modo de consulta.");
  expect(detail).not.toContain("pode realizar o encaminhamento institucional pelo organograma");
 });
});
