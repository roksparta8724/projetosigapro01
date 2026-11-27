// @vitest-environment jsdom
import {render,fireEvent,within} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {describe,it,expect} from "vitest";
import {AppSidebar} from "@/components/platform/AppSidebar";
import {MUNICIPAL_ADMIN_SECTIONS,municipalAdminSection,sidebarRouteActive,sidebarParentActive} from "@/lib/municipalAdminNavigation";
const Icon=()=> <svg aria-hidden="true"/>;
const groups=[{title:"Administração",items:[{to:"/prefeitura",label:"Administração municipal",icon:Icon,children:MUNICIPAL_ADMIN_SECTIONS.map(s=>({to:s.to,label:s.label,icon:Icon}))}]},{title:"Operação",items:[{to:"/prefeitura/ti",label:"TI",icon:Icon,children:[{to:"/prefeitura/ti",label:"Central TI"},{to:"/prefeitura/ti/memorandos",label:"Memorandos e comunicações"}]}]}];
describe("Navegação administrativa sincronizada",()=>{
 it.each([["/prefeitura","","fila"],["/prefeitura","?secao=usuarios","usuarios"],["/prefeitura/usuarios/novo","","usuarios"],["/prefeitura/organograma","","organograma"],["/prefeitura/visao-geral/pendencias","","visao-geral"],["/prefeitura","?secao=historico","historico"]])("identifica %s %s", (path,search,expected)=>{
 expect(municipalAdminSection(path,search)).toBe(expected);
 expect(MUNICIPAL_ADMIN_SECTIONS.filter(s=>sidebarRouteActive(path,search,s.to)).map(s=>s.value)).toEqual([expected]);
 });
 it("não marca Administração para áreas operacionais",()=>{
 for(const path of ["/prefeitura/ti","/prefeitura/financeiro","/prefeitura/protocolos","/prefeitura/arrecadacao"]){expect(sidebarParentActive(path,"",groups[0].items[0])).toBe(false);}
 });
 it("marca usuário e reabre a seção ao mudar URL",()=>{
 const make=(pathname:string,search="")=><MemoryRouter><AppSidebar groups={groups} pathname={pathname} search={search}/></MemoryRouter>;
 const {container,rerender}=render(make("/prefeitura/ti"));
 const desktop=within(container.querySelector("aside")!);
 expect(desktop.getByRole("link",{name:"Central TI"})).toHaveAttribute("aria-current","page");
 rerender(make("/prefeitura","?secao=usuarios"));
 expect(desktop.getByRole("button",{name:"Administração municipal"})).toHaveAttribute("aria-expanded","true");
 expect(desktop.getByRole("link",{name:"Usuários"})).toHaveAttribute("aria-current","page");
 expect(container.querySelector("aside")!.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
 fireEvent.click(desktop.getByRole("button",{name:"Administração municipal"}));
 expect(desktop.getByRole("button",{name:"Administração municipal"})).toHaveAttribute("aria-expanded","false");
 rerender(make("/prefeitura","?secao=historico"));
 expect(desktop.getByRole("link",{name:"Histórico"})).toHaveAttribute("aria-current","page");
 });
});
