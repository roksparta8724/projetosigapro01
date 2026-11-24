// @vitest-environment jsdom
import {render,screen,within} from "@testing-library/react";
import {describe,it,expect} from "vitest";
import {Network} from "lucide-react";
import {readFileSync} from "node:fs";
import postcss from "postcss";
import {MasterOrganogramPanel,MasterOrganogramDirectory} from "@/components/platform/MasterOrganogramPanel";
const page=readFileSync("src/pages/saas/MasterAdminPage.tsx","utf8");
const css=readFileSync("src/styles/sigapro-master-workspace-premium-20261124.css","utf8");
describe("Master organogram dedicated compact panels",()=>{
 it("renders heading, action and content immediately adjacent, without generic cards",()=>{
  render(<MasterOrganogramPanel title="Organograma" description="Estrutura" icon={Network} actions={<button>Trocar Prefeitura</button>}><p>Administração</p></MasterOrganogramPanel>);
  const panel=screen.getByRole("region",{name:"Organograma"});
  expect(panel.children).toHaveLength(2);
  expect(panel.firstElementChild).toHaveAttribute("data-organogram-panel-header","true");
  expect(panel.lastElementChild).toHaveAttribute("data-organogram-panel-body","true");
  expect(within(panel).getByRole("heading",{name:"Organograma"})).toBeVisible();
  expect(within(panel).getByText("Administração")).toBeVisible();
  expect(panel.querySelector(".sig-ui-card,.sig-section-card,[data-ui=card]")).toBeNull();
 });
 it("shows all hierarchy depths and prevents cycles from hiding units",()=>{
  render(<MasterOrganogramDirectory users={[{department:"Administração"}]} units={[
   {id:"a",name:"Administração",unitType:"Secretaria"},
   {id:"b",name:"Protocolo",unitType:"Departamento",parentDepartmentId:"a"},
   {id:"c",name:"Triagem",unitType:"Setor",parentDepartmentId:"b"},
   {id:"d",name:"Unidade órfã",unitType:"Setor",parentDepartmentId:"absent"},
   {id:"e",name:"Ciclo A",unitType:"Setor",parentDepartmentId:"f"},
   {id:"f",name:"Ciclo B",unitType:"Setor",parentDepartmentId:"e"}
  ]}/>);
  const rows=screen.getAllByRole("listitem");
  expect(rows).toHaveLength(6);
  expect(rows[2]).toHaveAttribute("data-depth","2");
  expect(screen.getByText("1 lotado(s)")).toBeInTheDocument();
  expect(screen.getAllByText(/vínculo a revisar/)).toHaveLength(3);
 });
 it("uses the dedicated panels for all three organogram work areas",()=>{
  const organogram=page.slice(page.indexOf('{workspaceView === "organograma" ? ('),page.indexOf('{workspaceView === "usuarios" ||'));
  expect(organogram).not.toContain("<TableCard");
  expect(organogram).not.toContain("<SectionCard");
  expect(organogram).toContain("MasterOrganogramDirectory");
  expect(organogram).toContain('data-organogram-column="directory"');
  expect(organogram).toContain('data-organogram-column="editor"');
  const root=postcss.parse(css);
  const rule=root.nodes.find(n=>n.type==="rule"&&n.selector.endsWith("[data-organogram-panel]"));
  if(!rule||rule.type!=="rule")throw new Error("missing panel CSS");
  const declarations=new Map(rule.nodes.filter(n=>n.type==="decl").map(n=>[n.prop,n.value]));
  expect(declarations.get("grid-template-rows")).toBe("auto auto");
  expect(declarations.get("height")).toBe("auto");
  expect(declarations.get("min-height")).toBe("0");
  expect(declarations.get("align-content")).toBe("start");
 });
});
