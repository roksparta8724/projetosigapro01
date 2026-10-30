import { describe, expect, it } from "vitest";
import { canViewMunicipalProcessDocument, canAnalyzeProcessDocument, type SessionUser, type ProcessRecord } from "@/lib/platform";
const tenant="mun-campo";
const analyst = { id:"ana1", name:"Analista A", role:"analista", accountStatus:"active", tenantId:tenant, municipalityId:tenant, department:"Urbanismo e Obras", title:"Analista Técnico", accessLevel:1, email:"ana@prefeitura.test", userType:"Interno" } as SessionUser;
const process={id:"p1",tenantId:tenant,municipalityId:tenant,processControl:{currentFolder:"Vistoria"},analysis:{assignedTo:"Analista A",assignedProfileId:"ana1"},dispatches:[],payment:{guides:[]},status:"vistoria"} as unknown as ProcessRecord;
describe("documentos SIGAPRO: leitura e autoria",()=>{
  it("permite que um outro analista de Urbanismo visualize documento concluido",()=>{
    const other={...analyst,id:"ana2",name:"Analista B"};
    expect(canViewMunicipalProcessDocument(other,process,tenant)).toBe(true);
    expect(canAnalyzeProcessDocument(other,process,tenant)).toBe(false);
  });
  it("permite supervisao setorial sem dar edicao ao funcionario de outro setor",()=>{
    expect(canViewMunicipalProcessDocument({...analyst,id:"dir",role:"prefeitura_supervisor",title:"Diretor Municipal"},process,tenant)).toBe(true);
    expect(canViewMunicipalProcessDocument({...analyst,id:"sec",role:"prefeitura_supervisor",title:"Secretário Municipal"},process,tenant)).toBe(true);
    expect(canViewMunicipalProcessDocument({...analyst,id:"fin",role:"financeiro",department:"Financeiro"},process,tenant)).toBe(false);
  });
  it("bloqueia usuario externo e contas inativas",()=>{
    expect(canViewMunicipalProcessDocument({...analyst,id:"ext",role:"profissional_externo"},process,tenant)).toBe(false);
    expect(canViewMunicipalProcessDocument({...analyst,accountStatus:"blocked"},process,tenant)).toBe(false);
    expect(canViewMunicipalProcessDocument(analyst,{...process,municipalityId:"outro",tenantId:"outro"},tenant)).toBe(false);
  });
});
