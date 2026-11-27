// @vitest-environment jsdom
import {render,screen,fireEvent,within} from "@testing-library/react";
import {describe,it,expect,vi} from "vitest";
import {MunicipalOrganizationChart} from "@/components/platform/MunicipalOrganizationChart";
import {buildOrganizationRows,filterOrganizationRows} from "@/lib/municipalOrganizationTree";
const unit=(id:string,name:string,parentDepartmentId:string|null=null)=>({id,name,parentDepartmentId,code:id.toUpperCase(),unitType:"departamento",isActive:true,sortOrder:0,municipalityId:"qa",description:"",email:"",phone:""});
const units=[unit("a","Administração"),unit("b","Tecnologia da Informação","a"),unit("c","Infraestrutura e Redes","b")];
describe("Organograma recolhível",()=>{
 it("abre e fecha níveis sem esconder a raiz",()=>{
 render(<MunicipalOrganizationChart departments={units}/>);
 expect(screen.queryByText("Infraestrutura e Redes")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Expandir Administração"}));
 fireEvent.click(screen.getByRole("button",{name:"Expandir Tecnologia da Informação"}));
 expect(screen.getByText("Infraestrutura e Redes")).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"Recolher tudo"}));
 expect(screen.queryByText("Infraestrutura e Redes")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Expandir tudo"}));
 expect(screen.getByText("Infraestrutura e Redes")).toBeVisible();
 });
 it("pesquisa sem acento, preserva ancestrais e restaura expansão",()=>{
 render(<MunicipalOrganizationChart departments={units}/>);
 fireEvent.change(screen.getByRole("textbox",{name:"Pesquisar unidades do organograma"}),{target:{value:"informacao"}});
 expect(screen.getByText("Administração")).toBeVisible();
 expect(screen.getByText("Tecnologia da Informação")).toBeVisible();
 expect(screen.queryByText("Infraestrutura e Redes")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Limpar pesquisa"}));
 expect(screen.queryByText("Tecnologia da Informação")).not.toBeInTheDocument();
 });
 it("preserva ações administrativas e não mostra ações para consulta",()=>{
 const edit=vi.fn(),add=vi.fn();const {rerender}=render(<MunicipalOrganizationChart departments={units} onEdit={edit} onAddChild={add}/>);
 fireEvent.click(screen.getByRole("button",{name:"Editar Administração"}));expect(edit).toHaveBeenCalledWith(units[0]);
 fireEvent.click(screen.getByRole("button",{name:"Adicionar unidade em Administração"}));expect(add).toHaveBeenCalledWith("a");
 rerender(<MunicipalOrganizationChart departments={units}/>);
 expect(screen.queryByRole("button",{name:"Editar Administração"})).not.toBeInTheDocument();
 });
 it("não perde unidades órfãs ou cíclicas",()=>{
 const rows=buildOrganizationRows([...units,unit("d","Órfã","missing"),unit("e","Ciclo A","f"),unit("f","Ciclo B","e")]);
 expect(rows).toHaveLength(6);expect(rows.filter(r=>r.detached)).toHaveLength(3);
 expect(filterOrganizationRows(rows,"ciclo",new Set())).toHaveLength(2);
 });
 it("mostra equipe somente quando expandida",()=>{
 render(<MunicipalOrganizationChart departments={[units[2]]} members={[{id:"p",name:"Servidor de teste",department:units[2].name}]}/>);
 expect(screen.queryByText("Servidor de teste")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Expandir Infraestrutura e Redes"}));
 expect(within(screen.getByRole("list",{name:"Equipe de Infraestrutura e Redes"})).getByText("Servidor de teste")).toBeVisible();
 });
});
