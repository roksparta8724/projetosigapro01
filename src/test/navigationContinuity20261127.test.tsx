import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {render,screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {AppSidebar} from "@/components/platform/AppSidebar";
import {MunicipalTransitionSurface} from "@/components/platform/MunicipalTransitionSurface";
import {Wallet} from "lucide-react";
describe("Navigation continuity November 27",()=>{
 it("separates confirmed department from active route on desktop and mobile",()=>{
  const {container}=render(<MemoryRouter><AppSidebar activeDepartment="Secretaria de Finanças" pathname="/dashboard" groups={[{title:"Municipal",items:[{to:"/prefeitura/financeiro",label:"Financeiro",icon:Wallet}]}]}/></MemoryRouter>);
  expect(container.querySelectorAll('[data-sigapro-active-department="true"]')).toHaveLength(2);
  expect(container.querySelector("aside.sig-sidebar-shell")?.textContent).toContain("Secretaria de Finanças");
 });
 it("prefetches the specific destination and scrolls only the visible sidebar",()=>{
  const app=readFileSync("src/App.tsx","utf8"),sidebar=readFileSync("src/components/platform/AppSidebar.tsx","utf8");
  expect(app).toContain('pathname === "/externo/controle/em-andamento"');
  expect(app.indexOf('pathname === "/externo/controle/em-andamento"')).toBeLessThan(app.indexOf('pathname.startsWith("/externo/controle")'));
  expect(app).toContain('pathname === "/legislacao/zoneamento"');
  expect(sidebar).toContain("node.querySelector<HTMLElement>");
  expect(sidebar).toContain("node.scrollTop +=");
 });
 it("renders accessible scoped transition without mounting old operational data",()=>{
  render(<MunicipalTransitionSurface departmentName="Análise Urbanística"/>);
  expect(screen.getByRole("status")).toHaveTextContent("Abrindo Análise Urbanística");
  expect(screen.getByText("Sincronizando o ambiente autorizado.")).toBeVisible();
 });
});
