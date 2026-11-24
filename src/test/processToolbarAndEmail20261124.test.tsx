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
