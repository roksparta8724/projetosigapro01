import {describe,expect,it} from "vitest";
import type {ProcessRecord} from "@/lib/platform";
import type {HabiteSePermitRecord} from "@/integrations/permits/habiteSePermitClient";
import type {ArtifactSignatureSnapshot} from "@/integrations/esign/artifactClient";
import {resolveVerifiedHabiteSePrint} from "@/lib/habiteSeSignedSnapshot";
import {readFileSync} from "node:fs";

const form={
 modality:"Habite-se integral", conditions:"Sem ressalvas",
 observations:"Observações preservadas da assinatura da Diretoria",
 sourcePermit:"ALV-2026-0003",sourceProcess:"0003/2026",completionDate:"2026-10-18",
};
const process={
 id:"48d5c2d9-55a2-48d5-b870-43112fc79e53",protocol:"MODIFICADO-POSTERIOR",
 ownerName:"PROPRIETARIO EDITADO",ownerDocument:"00000000000",
 technicalLead:"PROFISSIONAL ATUAL",address:"IMOVEL EDITADO",
 property:{area:900,usage:"Comercial",constructionStandard:"Alterado"},
} as ProcessRecord;
const permit={status:"emitido",permitNumber:"HAB-2026-00003",formData:form} as HabiteSePermitRecord;
const payload={
 schema:"sigapro.habite-se-permit.v1",processId:process.id,protocol:"PM-2026-00003",
 permitNumber:permit.permitNumber,
 owner:"PROPRIETARIO ASSINADO",ownerDocument:"12345678900",
 professional:"RESPONSAVEL ASSINADO",propertyAddress:"RUA DO IMOVEL ORIGINAL",
 areaM2:250,usage:"Residencial",constructionStandard:"Normal",formData:form,
};
const signature:ArtifactSignatureSnapshot={
 block:{artifact_type:"habite_se_permit",artifact_key:"habite-se-permit",
 artifact_hash:"a".repeat(64),verification_code:"8A9996907E138130528E",payload},
 signers:[{slot:"diretoria",name:"Diretor QA",role:"diretor",signed_at:"2026-10-18T10:00:00Z"}],
};
describe("SIGAPRO PDF Habite-se usa somente dados assinados",()=>{
 it("usa exclusivamente o snapshot assinado mesmo após edição do proprietário, uso, área e endereço",()=>{
  const result=resolveVerifiedHabiteSePrint(process,permit,signature);
  expect(result).not.toBeNull();
  expect(result?.process).toMatchObject({
   protocol:"PM-2026-00003",ownerName:"PROPRIETARIO ASSINADO",ownerDocument:"12345678900",
   technicalLead:"RESPONSAVEL ASSINADO",address:"RUA DO IMOVEL ORIGINAL",
   property:{area:250,usage:"Residencial",constructionStandard:"Normal"},
  });
  expect(result?.permit.formData).toEqual(form);
  expect(result?.verificationCode).toBe("8A9996907E138130528E");
  expect(process.ownerName).toBe("PROPRIETARIO EDITADO");
 });
 it("falha fechada sem assinatura, verificador, hash ou com versão documental divergente",()=>{
  expect(resolveVerifiedHabiteSePrint(process,permit,{...signature,signers:[]})).toBeNull();
  expect(resolveVerifiedHabiteSePrint(process,permit,{...signature,block:{...signature.block,verification_code:""}})).toBeNull();
  expect(resolveVerifiedHabiteSePrint(process,permit,{...signature,block:{...signature.block,artifact_hash:"false"}})).toBeNull();
  expect(resolveVerifiedHabiteSePrint(process,{...permit,formData:{...form,observations:"Editado"}},signature)).toBeNull();
  expect(resolveVerifiedHabiteSePrint(process,permit,{...signature,block:{...signature.block,payload:{...payload,processId:"outro"}}})).toBeNull();
  expect(resolveVerifiedHabiteSePrint(process,permit,{...signature,block:{...signature.block,payload:{...payload,permitNumber:"OUTRO"}}})).toBeNull();
  expect(resolveVerifiedHabiteSePrint(process,{...permit,status:"rascunho"},signature)).toBeNull();
 });
 it("refaz autenticação de dados no backend antes de abrir alvará emitido, nunca usa cache como prova",()=>{
  const source=readFileSync("src/components/platform/HabiteSePermitPanel.tsx","utf8");
  expect(source).toContain("getHabiteSePermit(process.id),");
  expect(source).toContain("getProcessArtifactSignatures(process.id, ARTIFACT_KEY),");
  expect(source).toContain("resolveVerifiedHabiteSePrint(process, saved.permit, signature)");
  expect(source).toContain("permit: pdfPermit");
  expect(source).toContain("process: pdfProcess");
  expect(source).toContain("PDF oficial bloqueado:");
  expect(source).not.toContain('const directorSigned = Boolean(directorSigner) || permit?.status === "emitido"');
 });
});
