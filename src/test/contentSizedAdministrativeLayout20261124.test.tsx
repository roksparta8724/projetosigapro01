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


it("stretches the common page track across the available width without stretching its height",()=>{
 const root=postcss.parse(css);
 const rule=root.nodes.find(n=>n.type==="rule"&&n.selector.endsWith('[data-content-flow="page"]'));
 if(!rule||rule.type!=="rule") throw new Error("Missing page geometry rule");
 const declarations=new Map(rule.nodes.filter(n=>n.type==="decl").map(n=>[n.prop,n.value]));
 expect(declarations.get("display")).toBe("grid");
 expect(declarations.get("grid-template-columns")).toBe("minmax(0,1fr)");
 expect(declarations.get("justify-content")).toBe("stretch");
 expect(declarations.get("justify-items")).toBe("stretch");
 expect(declarations.get("inline-size")).toBe("100%");
 expect(declarations.get("grid-auto-rows")).toBe("max-content");
 expect(master).toContain("@container master-workspace (min-width:800px)");
 expect(master).not.toContain("@media(min-width:1180px)");
});
