// @vitest-environment jsdom
import {render,screen} from "@testing-library/react";
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import postcss from "postcss";
import {PageContainer,MainGrid,SectionCard} from "@/components/platform/PageLayout";
import {TableCard} from "@/components/platform/TableCard";
const page=readFileSync("src/pages/saas/MasterAdminPage.tsx","utf8");
const css=readFileSync("src/styles/institutional-premium-v3.css","utf8");
const master=readFileSync("src/styles/sigapro-master-workspace-premium-20261124.css","utf8");
describe("Content-sized institutional layout",()=>{
 it("uses shared geometry markers on real rendered containers",()=>{
  const {container}=render(<PageContainer><MainGrid><SectionCard title="Unidades"><p>Sem unidades</p></SectionCard><TableCard title="Lotação"><p>Selecione usuário</p></TableCard></MainGrid></PageContainer>);
  expect(container.querySelectorAll('[data-content-flow="page"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-content-flow="grid"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-content-flow="card"]')).toHaveLength(2);
  expect(screen.getByText("Sem unidades")).toBeInTheDocument();
 });
 it("prevents styled hidden registries and artificial Master heights",()=>{
  expect(page).toContain('hidden={workspaceView !== "carteira"} style={workspaceView !== "carteira" ? { display: "none" } : undefined}');
  expect(page).toContain('hidden={workspaceView !== "usuarios"} style={workspaceView !== "usuarios" ? { display: "none" } : undefined}');
  expect(css).toContain('[data-master-preserved-panel][hidden]');
  expect(master).not.toContain("min-height:min(560px,70vh)");
 });
 it("uses a dedicated intrinsic grid for organogram, including an explicit invalid hierarchy state",()=>{
  expect(page).toContain('data-master-organogram-layout="compact"');
  expect(page).toContain('rootMasterDepartments.length === 0');
  expect(master).toContain('grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr)!important');
  expect(master).toContain('grid-auto-rows:max-content!important');
  expect(()=>postcss.parse(css)).not.toThrow();
  expect(()=>postcss.parse(master)).not.toThrow();
 });
});
