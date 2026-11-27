import {describe,it,expect,vi} from "vitest";
import {createHash} from "node:crypto";
import type {S3Client} from "@aws-sdk/client-s3";
import {archiveIcpSandboxCandidate} from "./certified-icp-candidate-archive";
const bytes=Buffer.from("%PDF-1.7\n"+"sandbox candidate fixture ".repeat(8)+"\n%%EOF\n");
const sha256=createHash("sha256").update(bytes).digest("hex");
const candidate={municipalityId:"11111111-1111-4111-8111-111111111111",processId:"22222222-2222-4222-8222-222222222222",requestId:"33333333-3333-4333-8333-333333333333",profileId:"44444444-4444-4444-8444-444444444444",artifactType:"construction_permit" as const,signerSlot:"diretoria" as const,bytes,sha256,byteRangeSha256:"a".repeat(64),certificateSha256:"b".repeat(64),cmsSha256:"c".repeat(64),identityVerified:true as const,cryptographicPreflightPassed:true as const,pdfPolicyVerified:false as const,issuanceAuthorized:false as const};
const env={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"fix/homologacao-geral-sei-dashboard-bank-20261113",VITE_SIGAPRO_NEON_ISOLATED:"true",VITE_NEON_DATA_API_URL:"https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1",SIGAPRO_QA_CERTIFIED_ARCHIVE_ENABLED:"true",SIGAPRO_QA_CERTIFIED_BUCKET:"sigapro-qa-certified-fixture",SIGAPRO_QA_CERTIFIED_R2_ACCOUNT_ID:"a".repeat(32),SIGAPRO_QA_CERTIFIED_R2_ACCESS_KEY_ID:"fictional-only",SIGAPRO_QA_CERTIFIED_R2_SECRET_ACCESS_KEY:"fictional-test-only",R2_BUCKET_DOCUMENTOS:"institutional",R2_ACCESS_KEY_ID:"institutional-id",R2_SECRET_ACCESS_KEY:"institutional-key"};
function mockClient(replay=false,corrupt=false){
 const send=vi.fn(async(cmd:{constructor:{name:string};input:Record<string,unknown>})=>{
  if(cmd.constructor.name==="PutObjectCommand"){if(replay)throw Object.assign(Error("already exists"),{$metadata:{httpStatusCode:412}});return {};}
  if(cmd.constructor.name==="GetObjectCommand"){const stored=Buffer.from(bytes);if(corrupt)stored[10]^=1;return {ContentLength:stored.length,ContentType:"application/pdf",Body:(async function*(){yield stored;})()};}
  throw Error("unexpected command");
 });return {send,client:{send} as unknown as S3Client};
}
describe("Dedicated ICP sandbox archive",()=>{
 it("writes once, reads actual bytes and never authorizes issuance",async()=>{
  const {send,client}=mockClient();
  const result=await archiveIcpSandboxCandidate(candidate,env,client);
  expect(result).toMatchObject({archiveVerified:true,pdfPolicyVerified:false,issuanceAuthorized:false,sha256});
  expect(result.objectKey).toContain("sandbox-only/certified-candidates/"+candidate.municipalityId);
  expect(send.mock.calls[0][0].input.IfNoneMatch).toBe("*");
  expect(send.mock.calls.map(([cmd])=>cmd.constructor.name)).toEqual(["PutObjectCommand","GetObjectCommand"]);
 });
 it("accepts retry only when exact archived bytes match",async()=>{
  await expect(archiveIcpSandboxCandidate(candidate,env,mockClient(true).client)).resolves.toMatchObject({archiveVerified:true});
  await expect(archiveIcpSandboxCandidate(candidate,env,mockClient(true,true).client)).rejects.toThrow("DOCUMENT_STORAGE_HASH_MISMATCH");
 });
 it("rejects shared storage, production and altered candidate before network",async()=>{
  const {send,client}=mockClient();
  for(const invalid of [{...env,VERCEL_ENV:"production"},{...env,SIGAPRO_QA_CERTIFIED_BUCKET:"institutional"},{...env,SIGAPRO_QA_CERTIFIED_R2_ACCESS_KEY_ID:env.R2_ACCESS_KEY_ID}])await expect(archiveIcpSandboxCandidate(candidate,invalid,client)).rejects.toThrow("ITI_SANDBOX_ARCHIVE_NOT_CONFIGURED");
  await expect(archiveIcpSandboxCandidate({...candidate,sha256:"0".repeat(64)},env,client)).rejects.toThrow("ITI_SANDBOX_CANDIDATE_INVALID");
  expect(send).not.toHaveBeenCalled();
 });
});
