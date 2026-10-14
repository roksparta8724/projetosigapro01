import { describe, expect, it } from "vitest";
import type { MunicipalDepartmentRecord } from "@/integrations/backend/platform";
import {
  findMunicipalDepartment,
  resolveMunicipalUnitIdentity,
} from "@/lib/municipalOrganization";

const departments: MunicipalDepartmentRecord[] = [
  { id:"adm", municipalityId:"m1", code:"ADM", name:"Administração", description:"", email:"", phone:"", isActive:true, parentDepartmentId:null, unitType:"secretaria", sortOrder:10 },
  { id:"prot", municipalityId:"m1", code:"PROT", name:"Protocolo", description:"", email:"", phone:"", isActive:true, parentDepartmentId:"adm", unitType:"departamento", sortOrder:20 },
  { id:"urb", municipalityId:"m1", code:"URB", name:"Urbanismo e Obras", description:"", email:"", phone:"", isActive:true, parentDepartmentId:null, unitType:"secretaria", sortOrder:30 },
  { id:"anu", municipalityId:"m1", code:"ANU", name:"Análise Urbanística", description:"", email:"", phone:"", isActive:true, parentDepartmentId:"urb", unitType:"departamento", sortOrder:40 },
  { id:"fisc", municipalityId:"m1", code:"FISC", name:"Fiscalização", description:"", email:"", phone:"", isActive:true, parentDepartmentId:"urb", unitType:"departamento", sortOrder:50 },
  { id:"fin", municipalityId:"m1", code:"FIN", name:"Financeiro", description:"", email:"", phone:"", isActive:true, parentDepartmentId:null, unitType:"secretaria", sortOrder:60 },
  { id:"trib", municipalityId:"m1", code:"TRIB", name:"Tributos", description:"", email:"", phone:"", isActive:true, parentDepartmentId:"fin", unitType:"departamento", sortOrder:70 },
  { id:"iptu", municipalityId:"m1", code:"IPTU", name:"Cadastro Imobiliário / IPTU", description:"", email:"", phone:"", isActive:true, parentDepartmentId:"trib", unitType:"setor", sortOrder:80 },
];

describe("municipal organogram identity resolver", () => {
  it("resolves Protocol under Administration with official codes", () => {
    const identity = resolveMunicipalUnitIdentity(departments, "Protocolo");
    expect(identity.matched).toBe(true);
    expect(identity.code).toBe("PROT");
    expect(identity.codePath).toBe("ADM / PROT");
    expect(identity.breadcrumb).toBe("Administração › Protocolo");
  });

  it("resolves Urban Analysis under Urbanism and Works", () => {
    const identity = resolveMunicipalUnitIdentity(departments, "Análise Urbanística");
    expect(identity.codePath).toBe("URB / ANU");
    expect(identity.breadcrumb).toBe("Urbanismo e Obras › Análise Urbanística");
  });

  it("resolves nested finance hierarchy through Tributos to IPTU", () => {
    const identity = resolveMunicipalUnitIdentity(departments, "IPTU");
    expect(identity.codePath).toBe("FIN / TRIB / IPTU");
    expect(identity.breadcrumb).toBe("Financeiro › Tributos › Cadastro Imobiliário / IPTU");
  });

  it("matches normalized names and official codes", () => {
    expect(findMunicipalDepartment(departments, "analise urbanistica")?.id).toBe("anu");
    expect(findMunicipalDepartment(departments, "ANU")?.id).toBe("anu");
    expect(findMunicipalDepartment(departments, "Cadastro imobiliario IPTU")?.id).toBe("iptu");
  });

  it("does not invent an official code for an unknown dispatch target", () => {
    const identity = resolveMunicipalUnitIdentity(departments, "Unidade inexistente");
    expect(identity.matched).toBe(false);
    expect(identity.codePath).toBe("");
    expect(identity.breadcrumb).toBe("Unidade inexistente");
  });
});
