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
  expect(frame.match(/portalContainer=\{accountDock\}/g)).toHaveLength(2);
  expect(frame).toContain('data-account-panel="mobile"');
  expect(frame).toContain('data-account-panel="desktop"');
  expect(css).toContain("inset:100% 0 auto auto!important");
  expect(css).not.toContain("sigAccountViewportIn");
  expect(css).not.toContain("sigAccountPanelIn");
  expect(()=>postcss.parse(css)).not.toThrow();
 });
});
