// @vitest-environment node
import {describe,it,expect,vi} from "vitest";
import {renderCertifiedPermitDraft,hashCertifiedPermitRenderPayload} from "./certified-permit-draft-renderer";
import type {ProcessRecord} from "../src/lib/platform";
import {buildConstructionPermitFormData} from "../src/lib/constructionPermit";
const municipalityId="11111111-1111-4111-8111-111111111111",processId="22222222-2222-4222-8222-222222222222",createdAt="2026-11-27T12:30:00.000Z";
const process={id:processId,municipalityId,tenantId:municipalityId,protocol:"QA-PROC-001",type:"Construção",ownerName:"TITULAR FICTICIO QA",ownerDocument:"DOC-QA",technicalLead:"RESPONSAVEL FICTICIO",address:"RUA DE TESTE",property:{registration:"REG-QA",iptu:"IPTU-QA",lot:"1",block:"2",area:123,usage:"Residencial",workType:"Construção",constructionStandard:"Normal"}} as ProcessRecord;
const shared={municipalityId,processId,snapshotSha256:"a".repeat(64),createdAt};
const branding={municipalityName:"Campo Limpo Paulista",municipalityLogoUrl:"https://example.invalid/logo.png",process};
const construction={...shared,artifactType:"construction_permit" as const,data:{...branding,permit:{processId,municipalityId,permitNumber:"ALV-QA-01",status:"aguardando_diretor" as const,preparedAt:createdAt,updatedAt:createdAt,formData:{...buildConstructionPermitFormData(process),complementaryConditions:"CONDICAO QA ".repeat(250)+"ULTIMA-CONDICAO-QA"}}}};
const habite={...shared,artifactType:"habite_se_permit" as const,data:{...branding,permit:{id:"fixture",processId,municipalityId,permitNumber:"HAB-QA-01",status:"aguardando_diretor" as const,formData:{conditions:"CONDICAO QA ".repeat(250)+"ULTIMA-RESSALVA-QA",observations:"PARECER QA",modality:"Habite-se integral",sourceProcess:"QA-ORIGEM",sourcePermit:"QA-ALVARA",completionDate:"2026-11-27"}}}};
describe("Server render of actual municipal layouts, unsigned sandbox drafts",()=>{
 it("renders the same construction and Habite-se bytes twice without browser or network",async()=>{
  const network=vi.fn(async()=>{throw Error("Unexpected network");});
  vi.stubGlobal("fetch",network);
  try{
   for(const input of [construction,habite]){
    const digest=hashCertifiedPermitRenderPayload(input);
    const a=await renderCertifiedPermitDraft(input,digest),b=await renderCertifiedPermitDraft(input,digest);
    expect(a.renderPayloadSha256).toBe(digest);
    expect(a.originalSha256).toBe(b.originalSha256);
    expect(a.preparedPdfSha256).toBe(b.preparedPdfSha256);
    expect(a.bytes.subarray(0,a.originalBytes.length)).toEqual(a.originalBytes);
    expect(a.originalBytes.toString("latin1")).toContain("TITULAR FICTICIO QA");
    expect(a.originalBytes.toString("latin1")).toContain("SEM VALIDADE DE ALVARA");
    expect(a.originalBytes.toString("latin1")).toContain(input.artifactType==="construction_permit"?"ULTIMA-CONDICAO-QA":"ULTIMA-RESSALVA-QA");
    expect(a.officialPermit).toBe(false);expect(a.issuanceAuthorized).toBe(false);
   }
   expect(network).not.toHaveBeenCalled();
  }finally{vi.unstubAllGlobals();}
 });
 it("rejects a mixed tenant, wrong process, wrong permit status or invalid snapshot",async()=>{
  for(const bad of [{...construction,municipalityId:processId},{...construction,processId:municipalityId},{...construction,snapshotSha256:"invalid"},{...construction,data:{...construction.data,permit:{...construction.data.permit,status:"emitido" as const}}}])await expect(renderCertifiedPermitDraft(bad,hashCertifiedPermitRenderPayload(bad))).rejects.toThrow();
 });
 it("rejects modified process, legal conditions and municipal branding against the persisted render digest",async()=>{
  const digest=hashCertifiedPermitRenderPayload(construction);
  for(const changed of [{...construction,data:{...construction.data,municipalityName:"Outra prefeitura"}},{...construction,data:{...construction.data,process:{...process,ownerName:"Outro titular"}}},{...construction,data:{...construction.data,permit:{...construction.data.permit,formData:{...construction.data.permit.formData,complementaryConditions:"Texto substituido"}}}}])await expect(renderCertifiedPermitDraft(changed,digest)).rejects.toThrow("CERTIFIED_PERMIT_RENDER_PAYLOAD_HASH_MISMATCH");
 });
});
