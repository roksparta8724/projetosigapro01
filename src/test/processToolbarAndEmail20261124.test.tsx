// @vitest-environment jsdom
import {render,screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {describe,it,expect,vi} from "vitest";
import {ProcessWorkspaceHeader} from "@/components/platform/ProcessWorkspaceHeader";
import {authEmailErrorMessage} from "@/lib/authEmailError";
import {readFileSync} from "node:fs";
import postcss from "postcss";
describe("Operational toolbar and authentication email",()=>{
 it("does not permit marking without selection, but keeps filtered export available",()=>{
  render(<MemoryRouter><ProcessWorkspaceHeader embedded hideSearchInput processes={[]} filteredCount={4} search="" onSearch={vi.fn()} quickFilter="todos" onFilter={vi.fn()} selectedCount={0} allPageSelected={false} pageCount={4} onTogglePage={vi.fn()} onClearSelection={vi.fn()} oneSelected={null} canDispatch={()=>false} showSensitiveDetails bulkBusy={false} markerOptions={[]} onExport={vi.fn()}/></MemoryRouter>);
  expect(screen.getByRole("button",{name:"Marcar"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Excel"})).toBeEnabled();
  expect(screen.getByRole("button",{name:"Marcar"})).toHaveAttribute("data-process-toolbar-action","mark");
 });
 it("uses explicit neutral disabled and readable open states",()=>{
  const css=readFileSync("src/styles/sigapro-responsive-process-workspace-20261124.css","utf8");
  expect(()=>postcss.parse(css)).not.toThrow();
  expect(css).toContain("background:var(--pa-off)!important");
  expect(css).toContain('data-state="open"]:not(:disabled)');
  expect(css).toContain("background:transparent!important;box-shadow:none!important");
 });
 it("translates email failures without exposing provider details",()=>{
  expect(authEmailErrorMessage({message:"Failed to send email secret=123"})).toContain("não confirmou");
  expect(authEmailErrorMessage({message:"Failed to send email secret=123"})).not.toContain("secret");
  expect(authEmailErrorMessage("429 rate limit")).toContain("limite temporário");
  expect(authEmailErrorMessage("network timeout")).toContain("temporariamente indisponível");
 });
});

describe("Intrinsic toolbar geometry",()=>{
 it("groups selection separately and keeps the marker label and icons in the same control",()=>{
  const {container}=render(<MemoryRouter><ProcessWorkspaceHeader embedded processes={[]} filteredCount={4} search="" onSearch={vi.fn()} quickFilter="todos" onFilter={vi.fn()} selectedCount={0} allPageSelected={false} pageCount={4} onTogglePage={vi.fn()} onClearSelection={vi.fn()} oneSelected={null} canDispatch={()=>false} showSensitiveDetails bulkBusy={false} markerOptions={[]} onExport={vi.fn()}/></MemoryRouter>);
  const toolbar=container.querySelector('[data-toolbar-layout="intrinsic-wrap"]')!;
  const selection=toolbar.querySelector(".sig-workspace-selection-group")!;
  const actions=screen.getByRole("group",{name:"Ações dos processos"});
  const marker=screen.getByRole("button",{name:"Marcar"});
  expect(selection).toHaveTextContent("0 selecionado(s)");
  expect(actions.firstElementChild).toBe(marker);
  expect(marker.querySelector("[data-toolbar-label]")).toHaveTextContent("Marcar");
  expect(marker).not.toHaveClass("sig-workspace-action-primary");
  expect(marker.querySelectorAll("svg")).toHaveLength(2);
 });
 it("uses visible intrinsic wrapping and never aligns an overflowing command strip to the right",()=>{
  const css=readFileSync("src/styles/sigapro-responsive-process-workspace-20261124.css","utf8");
  const root=postcss.parse(css);
  const rule=root.nodes.find(n=>n.type==="rule"&&n.selector.endsWith('[data-toolbar-layout="intrinsic-wrap"] > .sig-workspace-actions-list'));
  if(!rule||rule.type!=="rule")throw new Error("Missing toolbar geometry contract");
  const values=new Map(rule.nodes.filter(n=>n.type==="decl").map(n=>[n.prop,n.value]));
  expect(values.get("overflow")).toBe("visible");
  expect(values.get("flex-wrap")).toBe("wrap");
  expect(values.get("justify-content")).toBe("flex-start");
  expect(values.get("flex")).toBe("1 1 max-content");
  expect(css).toContain("min-width:88px!important");
  expect(css).toContain("flex:0 0 auto!important;width:max-content!important");
 });
});
