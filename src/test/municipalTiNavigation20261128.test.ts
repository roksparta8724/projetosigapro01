import {describe,it,expect,vi} from "vitest";
import {getSessionLandingPath,canAccessMunicipalArea,isMunicipalTiDepartmentLabel,type SessionUser} from "@/lib/platform";
import {verifyLoginLandingAccess} from "@/lib/loginLandingAccess";
const m="12345678-1234-4123-8123-123456789012";
const staff={id:"qa",name:"QA",role:"setor_intersetorial",title:"Suporte",department:"Infraestrutura e Redes",accessLevel:1,accountStatus:"active",email:"qa@example.invalid",municipalityId:m} as SessionUser;
describe("Navegação TI",()=>{
it.each(["Infraestrutura e Redes","TI-INF — Infraestrutura e Redes","Prefeitura / TI / Infraestrutura e Redes","Administração de Usuários e Permissões","Sistemas e Suporte"])("reconhece lotação %s",department=>{expect(isMunicipalTiDepartmentLabel(department)).toBe(true);expect(getSessionLandingPath({...staff,department})).toBe("/prefeitura/ti");for(const area of ["protocolos","analise","financeiro"] as const)expect(canAccessMunicipalArea({...staff,department},area)).toBe(false);});
it("preserva protocolo fora do TI",()=>expect(getSessionLandingPath({...staff,department:"Protocolo"})).toBe("/prefeitura/protocolos"));
it("valida contrato de configurações para TI, não protocolo",async()=>{const rpc=vi.fn(async()=>({data:true,error:null}));expect(await verifyLoginLandingAccess(staff.role,m,rpc,async()=>({isTi:true,allowed:true}))).toEqual({ok:true,path:"/prefeitura/ti"});expect(rpc).toHaveBeenLastCalledWith("assert_municipality_entitlement_v1",{_municipality_id:m,_capability:"module:Configurações",_increment:0});});
it("nega TI sem delegação sem tentar protocolo",async()=>{const rpc=vi.fn(async()=>({data:true,error:null}));const decision=await verifyLoginLandingAccess(staff.role,m,rpc,async()=>({isTi:true,allowed:false}));expect(decision.ok).toBe(false);expect(rpc).toHaveBeenCalledTimes(1);});
it("preserva contrato e rota dos demais setores",async()=>{const rpc=vi.fn(async()=>({data:true,error:null}));expect(await verifyLoginLandingAccess(staff.role,m,rpc,async()=>({isTi:false,allowed:true}))).toEqual({ok:true,path:"/prefeitura/protocolos"});expect(rpc).toHaveBeenLastCalledWith("assert_municipality_entitlement_v1",{_municipality_id:m,_capability:"module:Protocolo digital",_increment:0});});
});
