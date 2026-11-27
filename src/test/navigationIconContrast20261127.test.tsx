import {describe,it,expect} from "vitest";
import {render} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {AppSidebar} from "@/components/platform/AppSidebar";
import {Landmark} from "@/components/platform/PremiumIcons";
import {Network} from "lucide-react";
import {readFileSync} from "node:fs";
const groups=[{title:"Município",items:[{to:"/prefeitura",label:"Prefeitura",icon:Landmark},{to:"/prefeitura/organograma",label:"Organograma",icon:Network}]}];
function luminance(hex:string){
 const rgb=hex.replace("#","").match(/../g)!.map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe("Shared navigation SVG paint",()=>{
 it.each([true,false])("labels fill versus outline in both desktop and mobile, dark=%s",(darkSurface)=>{
  const {container}=render(<MemoryRouter><AppSidebar pathname="/prefeitura" groups={groups} darkSurface={darkSurface}/></MemoryRouter>);
  const selected=container.querySelectorAll('a[data-sidebar-active="true"]');
  expect(selected).toHaveLength(2);
  for(const a of selected){
   expect(a).toHaveAttribute("data-sigapro-nav-icon-contrast",darkSurface?"light-ink":"dark-ink");
   expect(a.querySelector("svg")).toHaveAttribute("data-sigapro-icon-paint","filled");
  }
  for(const a of container.querySelectorAll('a[href="/prefeitura/organograma"]'))expect(a.querySelector("svg")).not.toHaveAttribute("data-sigapro-icon-paint");
 });
 it("pairs foreground and background at a minimum 4.5:1 for the selected icon tile and row",()=>{
  for(const [ink,bg] of [["#ffffff","#25617d"],["#ffffff","#194b65"],["#ffffff","#163e55"],["#123e59","#e8f2f9"],["#123e59","#eaf4fa"],["#ffffff","#12567e"]])expect(contrast(ink,bg)).toBeGreaterThanOrEqual(4.5);
 });
 it("owns both SVG and path fill, without changing the shape of outlined glyphs",()=>{
  const css=readFileSync("src/styles/sigapro-navigation-continuity-20261127.css","utf8");
  expect(css).toContain('svg[data-sigapro-icon-paint="filled"] :is(path,circle,rect,polygon,ellipse):not([fill="none"])');
  expect(css).toContain("fill:var(--sig-nav-icon-ink)!important");
  expect(css).toContain("stroke:var(--sig-nav-icon-ink)!important");
  expect(css).toContain('svg:not([data-sigapro-icon-paint="filled"])');
 });
});
