import {describe,expect,it} from "vitest";
import type {ProcessRecord} from "@/lib/platform";
import type {HabiteSePermitRecord} from "@/integrations/permits/habiteSePermitClient";
import type {ArtifactSignatureSnapshot} from "@/integrations/esign/artifactClient";
import {resolveVerifiedHabiteSePrint} from "@/lib/habiteSeSignedSnapshot";
import {buildHabiteSePermitPdfBlob} from "@/lib/habiteSePermitPdf";

const form={modality:"Habite-se integral",conditions:"Sem ressalvas",
 observations:"Texto exato preservado",sourcePermit:"ALV-0001",
 sourceProcess:"0001/2026",completionDate:"2026-10-18"};
const process={
 id:"48d5c2d9-55a2-48d5-b870-43112fc79e53",protocol:"PROTOCOLO ALTERADO",
 ownerName:"NOME ALTERADO",ownerDocument:"999999999",
 technicalLead:"PROFISSIONAL ALTERADO",address:"ENDERECO ALTERADO",
 property:{area:1500,usage:"Comercial",constructionStandard:"Atualizado"},
} as ProcessRecord;
const permit={status:"emitido",permitNumber:"HAB-2026-00003",formData:form} as HabiteSePermitRecord;
const artifact={schema:"sigapro.habite-se-permit.v1",processId:process.id,protocol:"PM-2026-00003",
 permitNumber:permit.permitNumber,owner:"TITULAR ASSINADO",
 ownerDocument:"12345678900",professional:"PROFISSIONAL ASSINADO",
 propertyAddress:"RUA ORIGINAL ASSINADA",areaM2:250,
 usage:"Residencial",constructionStandard:"Normal",formData:form};
const signatures:ArtifactSignatureSnapshot={
 block:{artifact_type:"habite_se_permit",artifact_key:"habite-se-permit",
 artifact_hash:"a".repeat(64),verification_code:"8A9996907E138130528E",payload:artifact},
 signers:[{slot:"diretoria",name:"Diretor QA",role:"diretor",signed_at:"2026-10-18T10:00:00Z"}],
};
async function binaryText(blob:Blob):Promise<string>{
 const bytes=typeof blob.arrayBuffer==="function"
  ?await blob.arrayBuffer()
  :await new Promise<ArrayBuffer>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result as ArrayBuffer);
    reader.onerror=()=>reject(reader.error);
    reader.readAsArrayBuffer(blob);
   });
 return Buffer.from(bytes).toString("latin1");
}
describe("Habite-se — prova do PDF gerado com dados congelados na assinatura",()=>{
 it("imprime dados do artefato assinado e nunca os dados alterados no processo",async()=>{
  const frozen=resolveVerifiedHabiteSePrint(process,permit,signatures);
  expect(frozen).not.toBeNull();
  if(!frozen)throw Error("SIGNED_SNAPSHOT_NOT_VERIFIED");
  const pdf=await buildHabiteSePermitPdfBlob({
   permit:frozen.permit,process:frozen.process,
   municipalityName:"Prefeitura Municipal de Teste",
   directorSignature:{name:frozen.director.name,role:frozen.director.role,
     signedAt:frozen.director.signed_at},
   verificationCode:frozen.verificationCode,evidenceHash:frozen.evidenceHash,
  });
  expect(pdf.type).toBe("application/pdf");
  expect(pdf.size).toBeGreaterThan(3500);
  const data=await binaryText(pdf);
  expect(data.startsWith("%PDF-")).toBe(true);
  expect(data).toContain("TITULAR ASSINADO");
  expect(data).toContain("PROFISSIONAL ASSINADO");
  expect(data).toContain("RUA ORIGINAL ASSINADA");
  expect(data).toContain("PM-2026-00003");
  expect(data).not.toContain("NOME ALTERADO");
  expect(data).not.toContain("ENDERECO ALTERADO");
  expect(data).not.toContain("PROTOCOLO ALTERADO");
 });
});
