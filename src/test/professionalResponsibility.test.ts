import {describe,expect,it} from "vitest";
import {defaultProtocolDraftForm} from "@/lib/protocolDraft";
import {inferProfessionalCouncil,technicalResponsibilityLabel,compatibleTechnicalDocumentLabel} from "@/lib/professionalResponsibility";
describe("council identity and technical responsibility",()=>{
  it.each([
    ["Engenheiro(a) Civil","CREA","ART"],["Arquiteto(a) e Urbanista","CAU","RRT"],
    ["Técnico(a) em Edificações","CFT/CRT","TRT"],["Engenheiro Civil","CREA","ART"],
    ["Arquiteto","CAU","RRT"],["Técnico de Edificações","CFT/CRT","TRT"],
  ])("%s maps to %s and %s",(role,council,document)=>{
    expect(inferProfessionalCouncil(role)).toBe(council);
    expect(technicalResponsibilityLabel(council)).toBe(document);
  });
  it("does not change persisted checklist document keys to display TRT",()=>{
    expect(compatibleTechnicalDocumentLabel("ART ou RRT")).toBe("ART / RRT / TRT");
    expect(compatibleTechnicalDocumentLabel("Memorial descritivo")).toBe("Memorial descritivo");
  });
  it("retains backward-compatible professionals, optional independent execution and authenticated protocol owner",()=>{
    expect(defaultProtocolDraftForm.execucaoMesmoResponsavel).toBe(true);
    expect(defaultProtocolDraftForm.protocolanteMesmoResponsavel).toBe(true);
    expect(defaultProtocolDraftForm.profissional).toBe("");
    expect(defaultProtocolDraftForm.registro).toBe("");
    expect(defaultProtocolDraftForm.execucaoRegistro).toBe("");
  });
});