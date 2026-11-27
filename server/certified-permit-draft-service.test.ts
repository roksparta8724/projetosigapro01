// @vitest-environment node
import {describe,it,expect,vi} from "vitest";
import {prepareArchivedMunicipalDraft,preparePersistedMunicipalDraft} from "./certified-permit-draft-service";
import {hashCertifiedPermitRenderPayload} from "./certified-permit-draft-renderer";
import {archiveCertifiedPermitDraft,readArchivedCertifiedPermitDraft,type CertifiedDraftArchiveManifest} from "./certified-permit-draft-archive";
import {buildConstructionPermitFormData} from "../src/lib/constructionPermit";
import type {ProcessRecord} from "../src/lib/platform";
import type {S3Client} from "@aws-sdk/client-s3";
const municipalityId="11111111-1111-4111-8111-111111111111",processId="22222222-2222-4222-8222-222222222222",requestId="33333333-3333-4333-8333-333333333333",createdAt="2026-11-27T12:30:00.000Z";
const process={id:processId,municipalityId,tenantId:municipalityId,protocol:"QA-PROC-01",type:"Construção",ownerName:"TITULAR FICTICIO QA",ownerDocument:"DOC-QA",technicalLead:"TECNICO QA",address:"RUA QA",property:{registration:"REG",iptu:"IPTU",lot:"1",block:"2",area:123,usage:"Residencial",workType:"Construção",constructionStandard:"Normal"}} as ProcessRecord;
const snapshot={municipalityId,processId,snapshotSha256:"a".repeat(64),createdAt,artifactType:"construction_permit" as const,data:{municipalityName:"Prefeitura de teste",process,permit:{processId,municipalityId,permitNumber:"ALV-QA",status:"aguardando_diretor" as const,preparedAt:createdAt,updatedAt:createdAt,formData:buildConstructionPermitFormData(process)}}};
const env={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"fix/homologacao-geral-sei-dashboard-bank-20261113",VITE_SIGAPRO_NEON_ISOLATED:"true",VITE_NEON_DATA_API_URL:"https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1",SIGAPRO_QA_CERTIFIED_ARCHIVE_ENABLED:"true",SIGAPRO_QA_CERTIFIED_BUCKET:"sigapro-qa-certified-fixture",SIGAPRO_QA_CERTIFIED_R2_ACCOUNT_ID:"a".repeat(32),SIGAPRO_QA_CERTIFIED_R2_ACCESS_KEY_ID:"fictional-id",SIGAPRO_QA_CERTIFIED_R2_SECRET_ACCESS_KEY:"fictional-key"};
function fixture(){
 const events:string[]=[],objects=new Map<string,Buffer>();
 let committed:CertifiedDraftArchiveManifest|null=null;
 const send=vi.fn(async(c:{constructor:{name:string};input:{Key:string;Body?:Uint8Array;IfNoneMatch?:string}})=>{
  const key=c.input.Key;events.push(c.constructor.name);
  if(c.constructor.name==="PutObjectCommand"){
   expect(c.input.IfNoneMatch).toBe("*");
   if(objects.has(key))throw Object.assign(Error("exists"),{$metadata:{httpStatusCode:412}});
   objects.set(key,Buffer.from(c.input.Body!));return {};
  }
  if(c.constructor.name==="GetObjectCommand"){
   const b=objects.get(key)!;return {ContentLength:b.length,ContentType:"application/pdf",Body:(async function*(){yield b;})()};
  }
  throw Error("unexpected");
 });
 const client={send} as unknown as S3Client;
 const storage={archive:((d,id,e)=>archiveCertifiedPermitDraft(d,id,e,client)) as typeof archiveCertifiedPermitDraft,read:((m,s,e)=>readArchivedCertifiedPermitDraft(m,s,e,client)) as typeof readArchivedCertifiedPermitDraft};
 const registry={read:vi.fn(async()=>{events.push("registry:read");return committed;}),recordOnce:vi.fn(async(m:CertifiedDraftArchiveManifest)=>{events.push("registry:commit");committed??=m;return committed;})};
 return {events,objects,registry,storage};
}
describe("Municipal draft render, immutable archive, and manifest commit",()=>{
 it("delivers exact verified archived bytes only after registry commit; retry is read-only",async()=>{
  const f=fixture(),input={snapshot,requestId,expectedRenderPayloadSha256:hashCertifiedPermitRenderPayload(snapshot),registry:f.registry,storage:f.storage,env};
  const first=await prepareArchivedMunicipalDraft(input);
  expect(first.registryConfirmed).toBe(true);expect(first.issuanceAuthorized).toBe(false);
  expect(f.events).toEqual(["registry:read","PutObjectCommand","GetObjectCommand","PutObjectCommand","GetObjectCommand","registry:commit","GetObjectCommand","GetObjectCommand"]);
  f.events.length=0;
  await expect(prepareArchivedMunicipalDraft({...input,snapshot:{...snapshot,data:{...snapshot.data,municipalityName:"Prefeitura divergente"}}})).rejects.toThrow("CERTIFIED_PERMIT_RENDER_PAYLOAD_HASH_MISMATCH");
  expect(f.events).toEqual([]);
  const retry=await prepareArchivedMunicipalDraft(input);
  expect(retry.reused).toBe(true);expect(retry.document.bytes).toEqual(first.document.bytes);
  expect(f.events).toEqual(["registry:read","GetObjectCommand","GetObjectCommand"]);
  f.objects.get(first.manifest.preparedKey)![12]^=1;
  await expect(prepareArchivedMunicipalDraft(input)).rejects.toThrow("CERTIFIED_DRAFT_ARCHIVE_HASH_MISMATCH");
 });
 it("uses the real registry adapter with parameterized insert and immutable read-back",async()=>{
  const f=fixture(),expectedRenderPayloadSha256=hashCertifiedPermitRenderPayload(snapshot);
  let row:Record<string,unknown>|undefined;
  const columns=["municipality_id","process_id","request_id","artifact_type","snapshot_sha256","render_payload_sha256","original_sha256","original_size","prepared_pdf_sha256","prepared_size","byte_range_sha256"];
  const query=vi.fn(async(sql:string,values:unknown[])=>{
   expect(values.slice(0,6)).toEqual([municipalityId,processId,requestId,snapshot.artifactType,snapshot.snapshotSha256,expectedRenderPayloadSha256]);
   if(sql.startsWith("INSERT")){
    expect(sql).toContain("ON CONFLICT DO NOTHING");expect(values).toHaveLength(11);
    row??=Object.fromEntries(columns.map((name,i)=>[name,values[i]]));return {rows:[]};
   }
   expect(sql).toMatch(/^SELECT /);return {rows:row?[row]:[]};
  });
  const input={snapshot,requestId,expectedRenderPayloadSha256,query,env,storage:f.storage};
  const first=await preparePersistedMunicipalDraft(input);
  expect(first.registryConfirmed).toBe(true);
  expect(row?.prepared_pdf_sha256).toBe(first.document.preparedPdfSha256);
  expect((await preparePersistedMunicipalDraft(input)).reused).toBe(true);
  expect(query.mock.calls.filter(([sql])=>sql.startsWith("INSERT"))).toHaveLength(1);
  row={...row,municipality_id:processId};
  await expect(preparePersistedMunicipalDraft(input)).rejects.toThrow("CERTIFIED_DRAFT_REGISTRY_SCOPE_INVALID");
 });
 it("fails closed when registry commit returns a different manifest",async()=>{
  const f=fixture();
  f.registry.recordOnce.mockImplementationOnce(async(m)=>({...m,preparedPdfSha256:"0".repeat(64)}));
  await expect(prepareArchivedMunicipalDraft({snapshot,requestId,expectedRenderPayloadSha256:hashCertifiedPermitRenderPayload(snapshot),registry:f.registry,storage:f.storage,env})).rejects.toThrow("CERTIFIED_DRAFT_REGISTRY_COMMIT_MISMATCH");
 });
});
