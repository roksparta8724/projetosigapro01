import {describe,it,expect,vi} from "vitest";
import {jsPDF} from "jspdf";
import {createHash} from "node:crypto";
import type {S3Client} from "@aws-sdk/client-s3";
import {prepareFirstPermitCertificateRevision} from "./certified-pdf-incremental-revision";
import {archiveCertifiedPermitDraft,readArchivedCertifiedPermitDraft} from "./certified-permit-draft-archive";
const env={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"fix/homologacao-geral-sei-dashboard-bank-20261113",VITE_SIGAPRO_NEON_ISOLATED:"true",VITE_NEON_DATA_API_URL:"https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1",SIGAPRO_QA_CERTIFIED_ARCHIVE_ENABLED:"true",SIGAPRO_QA_CERTIFIED_BUCKET:"sigapro-qa-certified-fixture",SIGAPRO_QA_CERTIFIED_R2_ACCOUNT_ID:"a".repeat(32),SIGAPRO_QA_CERTIFIED_R2_ACCESS_KEY_ID:"fictional-id",SIGAPRO_QA_CERTIFIED_R2_SECRET_ACCESS_KEY:"fictional-key"};
const scope={municipalityId:"11111111-1111-4111-8111-111111111111",processId:"22222222-2222-4222-8222-222222222222",requestId:"33333333-3333-4333-8333-333333333333",artifactType:"construction_permit" as const,snapshotSha256:"b".repeat(64),renderPayloadSha256:"c".repeat(64)};
function draft(){
 const pdf=new jsPDF();pdf.text("QA - MINUTA SEM VALIDADE",10,20);
 const originalBytes=Buffer.from(pdf.output("arraybuffer")),originalSha256=createHash("sha256").update(originalBytes).digest("hex");
 return {...scope,...prepareFirstPermitCertificateRevision({originalBytes,expectedOriginalSha256:originalSha256,slot:"diretoria"}),originalBytes,renderedFromMunicipalDraft:true as const,officialPermit:false as const};
}
function store(){
 const objects=new Map<string,Buffer>();
 const send=vi.fn(async(c:{constructor:{name:string};input:{Key:string;Body?:Uint8Array;IfNoneMatch?:string}})=>{
  const key=c.input.Key;
  if(c.constructor.name==="PutObjectCommand"){
   expect(c.input.IfNoneMatch).toBe("*");
   if(objects.has(key))throw Object.assign(Error("exists"),{$metadata:{httpStatusCode:412}});
   objects.set(key,Buffer.from(c.input.Body!));return {};
  }
  if(c.constructor.name==="GetObjectCommand"){
   const b=objects.get(key)!;return {ContentLength:b.length,ContentType:"application/pdf",Body:(async function*(){yield b.subarray(0,31);yield b.subarray(31);})()};
  }
  throw Error("unexpected");
 });
 return {objects,send,client:{send} as unknown as S3Client};
}
describe("QA certified draft immutable storage",()=>{
 it("archives original/prepared bytes, retries idempotently and reconstructs without any PUT on read",async()=>{
  const d=draft(),s=store();
  const m=await archiveCertifiedPermitDraft(d,scope.requestId,env,s.client);
  expect(await archiveCertifiedPermitDraft(d,scope.requestId,env,s.client)).toEqual(m);
  expect(s.objects.size).toBe(2);
  s.send.mockClear();
  const result=await readArchivedCertifiedPermitDraft(m,scope,env,s.client);
  expect(result.bytes).toEqual(d.bytes);expect(result.originalBytes).toEqual(d.originalBytes);
  expect(result.issuanceAuthorized).toBe(false);
  expect(s.send.mock.calls.map(([c])=>c.constructor.name)).toEqual(["GetObjectCommand","GetObjectCommand"]);
 });
 it("rejects corrupted bytes and manifest paths, foreign scope and production",async()=>{
  const d=draft(),s=store(),m=await archiveCertifiedPermitDraft(d,scope.requestId,env,s.client);
  await expect(readArchivedCertifiedPermitDraft({...m,preparedKey:m.originalKey},scope,env,s.client)).rejects.toThrow("CERTIFIED_DRAFT_ARCHIVE_MANIFEST_INVALID");
  await expect(readArchivedCertifiedPermitDraft(m,{...scope,municipalityId:scope.processId},env,s.client)).rejects.toThrow();
  await expect(archiveCertifiedPermitDraft(d,scope.requestId,{...env,VERCEL_ENV:"production"},s.client)).rejects.toThrow();
  s.objects.get(m.preparedKey)![10]^=1;
  await expect(readArchivedCertifiedPermitDraft(m,scope,env,s.client)).rejects.toThrow("CERTIFIED_DRAFT_ARCHIVE_HASH_MISMATCH");
  await expect(archiveCertifiedPermitDraft(d,scope.requestId,env,s.client)).rejects.toThrow("CERTIFIED_DRAFT_ARCHIVE_HASH_MISMATCH");
 });
});
