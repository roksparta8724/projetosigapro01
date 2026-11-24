// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import postcss from "postcss";
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from "@/components/ui/dropdown-menu";
import {useState} from "react";
function Fixture(){
 const [dock,setDock]=useState<HTMLDivElement|null>(null);
 return <div ref={setDock} data-testid="dock"><DropdownMenu modal={false}><DropdownMenuTrigger>Abrir perfil</DropdownMenuTrigger><DropdownMenuContent portalContainer={dock} data-account-panel="desktop"><DropdownMenuItem>Meu perfil</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
}
describe("Topbar account dock",()=>{
 it("renders the account portal inside its topbar rather than document body",async()=>{
  render(<Fixture/>);
  fireEvent.keyDown(screen.getByRole("button",{name:"Abrir perfil"}),{key:"ArrowDown"});
  await waitFor(()=>expect(screen.getByRole("menu")).toBeInTheDocument());
  expect(screen.getByTestId("dock")).toContainElement(screen.getByRole("menu"));
  expect(screen.getByRole("menuitem",{name:"Meu perfil"})).toBeVisible();
 });
 it("anchors both profile menus to the real topbar edge instead of magic offsets",()=>{
  const frame=readFileSync("src/components/platform/PortalFrame.tsx","utf8");
  const css=readFileSync("src/index.css","utf8");
  expect(frame).toContain("ref={setAccountDock}");
  expect(frame.match(/portalContainer=\{accountDock\}/g)).toHaveLength(4);
  expect(frame).toContain('data-account-panel="mobile"');
  expect(frame).toContain('data-account-panel="desktop"');
  expect(css).toContain("inset:100% 0 auto auto!important");
  expect(css).not.toContain("sigAccountViewportIn");
  expect(css).not.toContain("sigAccountPanelIn");
  expect(()=>postcss.parse(css)).not.toThrow();
 });
});

it("docks markers and themes, and removes the clipping local centering rule",()=>{
 const frame=readFileSync("src/components/platform/PortalFrame.tsx","utf8");
 const css=readFileSync("src/index.css","utf8");
 expect(frame).toContain('data-topbar-menu="markers"');
 expect(frame).toContain('data-topbar-menu="themes"');
 expect(css).not.toContain("top: calc(100% + 12px)");
 expect(css).toContain('width:min(416px,100%)');
 expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
 expect(frame).not.toContain('className="truncate text-[11px] font-medium">{option.label}');
});
it("keeps analyst route authoritative for tabs and direct actions",()=>{
 const analyst=readFileSync("src/pages/saas/AnalystDeskPage.tsx","utf8");
 const css=readFileSync("src/styles/sigapro-shared-surface-contrast-20261124.css","utf8");
 expect(analyst).toContain('const section: AnalystSection = requestedSection');
 expect(analyst).toContain('params.set("secao", next)');
 expect(analyst).toContain('className="sig-analysis-tabs"\n          persistInUrl={false}');
 expect(css).toContain('@container analysis-nav (min-width:1080px)');
 expect(()=>postcss.parse(css)).not.toThrow();
});
