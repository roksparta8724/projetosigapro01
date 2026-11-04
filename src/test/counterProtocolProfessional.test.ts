import {describe,expect,it} from "vitest";
import {defaultProtocolDraftForm} from "@/lib/protocolDraft";
import {isolateCounterProfessionalDraft,isLicensedProfessionalActivity,shouldAutofillTechnicalLead} from "@/lib/counterProtocolProfessional";
const clerk={names:["Servidor Administrativo QA"],emails:["servidor@prefeitura.test"],
  documents:["00000000000"],occupations:["Assistente Administrativo"]};
describe("balcão: clerk profile is never the construction technical lead",()=>{
  it("allows profile autofill only for actual external professionals",()=>{
    expect(shouldAutofillTechnicalLead("prefeitura_admin",true)).toBe(false);
    expect(shouldAutofillTechnicalLead("analista",false)).toBe(false);
    expect(shouldAutofillTechnicalLead("setor_intersetorial",false)).toBe(false);
    expect(shouldAutofillTechnicalLead("profissional_externo",false)).toBe(true);
    expect(shouldAutofillTechnicalLead("profissional_externo",true)).toBe(false);
  });
  it("distinguishes municipal administrative jobs from licensed professionals",()=>{
    expect(isLicensedProfessionalActivity("Assistente Administrativo")).toBe(false);
    expect(isLicensedProfessionalActivity("Engenheiro Civil")).toBe(true);
    expect(isLicensedProfessionalActivity("Arquiteto e Urbanista")).toBe(true);
    expect(isLicensedProfessionalActivity("Técnico em Edificações")).toBe(true);
    expect(isLicensedProfessionalActivity("Outro(a) profissional habilitado(a)")).toBe(true);
  });
  it("clears a demonstrably inherited administrative profile from a legacy counter draft",()=>{
    const old={...defaultProtocolDraftForm,profissional:clerk.names[0],tipoProfissional:"Assistente Administrativo",
      profissionalDocumento:clerk.documents[0],email:clerk.emails[0],registro:"REG-ADM",telefone:"11999990000"};
    const fixed=isolateCounterProfessionalDraft(old,clerk,true);
    expect(fixed.profissional).toBe("");expect(fixed.tipoProfissional).toBe("");
    expect(fixed.registro).toBe("");expect(fixed.email).toBe("");
    expect(fixed.proprietario).toBe(old.proprietario);
  });
  it("keeps legitimate technician data and all external drafts unchanged",()=>{
    const technician={...defaultProtocolDraftForm,profissional:"Engenheiro QA",tipoProfissional:"Engenheiro Civil",registro:"CREA-QA"};
    expect(isolateCounterProfessionalDraft(technician,clerk,true)).toEqual(technician);
    const sameName={...technician,profissional:clerk.names[0]};
    expect(isolateCounterProfessionalDraft(sameName,clerk,true)).toEqual(sameName);
    const administrative={...technician,tipoProfissional:"Assistente Administrativo",email:clerk.emails[0]};
    expect(isolateCounterProfessionalDraft(administrative,clerk,false)).toEqual(administrative);
  });
  it("does not erase a same-name draft without a second matching identity field",()=>{
    const entered={...defaultProtocolDraftForm,profissional:clerk.names[0],email:"outro@test.local",tipoProfissional:"Independente"};
    expect(isolateCounterProfessionalDraft(entered,clerk,true)).toEqual(entered);
  });
});