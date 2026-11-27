import {createHash} from "node:crypto";
import {GetObjectCommand,PutObjectCommand,S3Client} from "@aws-sdk/client-s3";
import {archiveConfig} from "./certified-icp-candidate-archive.js";
import {prepareFirstPermitCertificateRevision} from "./certified-pdf-incremental-revision.js";
import type {renderCertifiedPermitDraft} from "./certified-permit-draft-renderer.js";
type Draft=Awaited<ReturnType<typeof renderCertifiedPermitDraft>>;
type Env=Record<string,string|undefined>;
const hash=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
const MAX=32*1024*1024;
type Scope=Pick<Draft,"municipalityId"|"processId"|"artifactType"|"snapshotSha256"|"renderPayloadSha256"> & {requestId:string};
export type CertifiedDraftArchiveManifest=Scope&{
 originalSha256:string;originalSize:number;preparedPdfSha256:string;preparedSize:number;byteRangeSha256:string;
 originalKey:string;preparedKey:string;environment:"sandbox";issuanceAuthorized:false;
};
function base(scope:Scope){
 if(![scope.municipalityId,scope.processId,scope.requestId].every(v=>uuid.test(v))||
 !["construction_permit","habite_se_permit"].includes(scope.artifactType)||
 ![scope.snapshotSha256,scope.renderPayloadSha256].every(v=>hash.test(v)))throw Error("CERTIFIED_DRAFT_ARCHIVE_SCOPE_INVALID");
 return ["sandbox-only","certified-drafts",scope.municipalityId,scope.processId,scope.requestId,scope.artifactType,scope.snapshotSha256,scope.renderPayloadSha256].join("/");
}
async function read(client:S3Client,bucket:string,key:string,size:number,digest:string){
 if(!hash.test(digest)||!Number.isSafeInteger(size)||size<64||size>MAX)throw Error("CERTIFIED_DRAFT_ARCHIVE_MANIFEST_INVALID");
 const r=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
 const body=r.Body;
 if(!body||!(Symbol.asyncIterator in body))throw Error("CERTIFIED_DRAFT_ARCHIVE_STREAM_INVALID");
 try{
  if(r.ContentLength!==size||r.ContentType!=="application/pdf")throw Error("CERTIFIED_DRAFT_ARCHIVE_METADATA_INVALID");
  const bytes=Buffer.alloc(size);let offset=0;
  for await(const chunk of body){const part=Buffer.from(chunk);if(offset+part.length>size)throw Error("CERTIFIED_DRAFT_ARCHIVE_SIZE_MISMATCH");part.copy(bytes,offset);offset+=part.length;}
  if(offset!==size||sha(bytes)!==digest||bytes.subarray(0,5).toString()!=="%PDF-")throw Error("CERTIFIED_DRAFT_ARCHIVE_HASH_MISMATCH");
  return bytes;
 }finally{if("destroy" in body&&typeof body.destroy==="function")body.destroy();}
}
async function write(client:S3Client,bucket:string,key:string,bytes:Buffer,digest:string){
 try{await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:"application/pdf",IfNoneMatch:"*",Metadata:{sha256:digest,status:"sandbox-draft-not-issued"}}));}
 catch(error){const e=error as {name?:string;$metadata?:{httpStatusCode?:number}};if(e.name!=="PreconditionFailed"&&e.$metadata?.httpStatusCode!==412)throw error;}
 await read(client,bucket,key,bytes.length,digest);
}
function assertManifest(m:CertifiedDraftArchiveManifest,expected:Scope){
 const path=base(expected);
 if(base(m)!==path||m.environment!=="sandbox"||m.issuanceAuthorized!==false||
 ![m.originalSha256,m.preparedPdfSha256,m.byteRangeSha256].every(v=>hash.test(v))||
 m.originalKey!==path+"/original-"+m.originalSha256+".pdf"||m.preparedKey!==path+"/prepared-"+m.preparedPdfSha256+".pdf")
 throw Error("CERTIFIED_DRAFT_ARCHIVE_MANIFEST_INVALID");
}
/** Internal QA worker: scope and digest must come from a trusted municipal
 * snapshot adapter. No browser-supplied object key; no overwrite/delete.
 * Manifest is returned only after verifying both actual byte streams.
 * If either write fails, retry safely with the same hashes; a partial object
 * is never an issued permit. Persist the manifest in the authorized registry
 * before making it available to a signing session. */
export async function archiveCertifiedPermitDraft(draft:Draft,requestId:string,env:Env=process.env,override?:S3Client){
 const config=archiveConfig(env);
 const scope:Scope={municipalityId:draft.municipalityId,processId:draft.processId,artifactType:draft.artifactType,snapshotSha256:draft.snapshotSha256,renderPayloadSha256:draft.renderPayloadSha256,requestId};
 const path=base(scope);
 if(draft.officialPermit!==false||draft.issuanceAuthorized!==false||draft.pdfPolicyVerified!==false||draft.renderedFromMunicipalDraft!==true)throw Error("CERTIFIED_DRAFT_ARCHIVE_INVALID");
 const checked=prepareFirstPermitCertificateRevision({originalBytes:draft.originalBytes,expectedOriginalSha256:draft.originalSha256,slot:"diretoria"});
 if(!checked.bytes.equals(draft.bytes)||checked.preparedPdfSha256!==draft.preparedPdfSha256||checked.byteRangeSha256!==draft.byteRangeSha256)throw Error("CERTIFIED_DRAFT_ARCHIVE_BINDING_MISMATCH");
 const m:CertifiedDraftArchiveManifest={...scope,originalSha256:draft.originalSha256,originalSize:draft.originalBytes.length,preparedPdfSha256:draft.preparedPdfSha256,preparedSize:draft.bytes.length,byteRangeSha256:draft.byteRangeSha256,originalKey:path+"/original-"+draft.originalSha256+".pdf",preparedKey:path+"/prepared-"+draft.preparedPdfSha256+".pdf",environment:"sandbox",issuanceAuthorized:false};
 const client=override??new S3Client({region:"auto",endpoint:config.endpoint,credentials:config.credentials,maxAttempts:2});
 try{await write(client,config.bucket,m.originalKey,draft.originalBytes,m.originalSha256);await write(client,config.bucket,m.preparedKey,draft.bytes,m.preparedPdfSha256);return m;}
 finally{if(!override)client.destroy();}
}
/** Read-only reconstruction from a trusted persisted manifest; no regeneration
 * from mutable current municipal data. Independently verify both byte streams. */
export async function readArchivedCertifiedPermitDraft(m:CertifiedDraftArchiveManifest,expected:Scope,env:Env=process.env,override?:S3Client){
 const config=archiveConfig(env);assertManifest(m,expected);
 const client=override??new S3Client({region:"auto",endpoint:config.endpoint,credentials:config.credentials,maxAttempts:2});
 try{
  const original=await read(client,config.bucket,m.originalKey,m.originalSize,m.originalSha256);
  const prepared=await read(client,config.bucket,m.preparedKey,m.preparedSize,m.preparedPdfSha256);
  const checked=prepareFirstPermitCertificateRevision({originalBytes:original,expectedOriginalSha256:m.originalSha256,slot:"diretoria"});
  if(!checked.bytes.equals(prepared)||checked.byteRangeSha256!==m.byteRangeSha256)throw Error("CERTIFIED_DRAFT_ARCHIVE_BINDING_MISMATCH");
  return {...checked,originalBytes:original,archiveVerified:true as const};
 }finally{if(!override)client.destroy();}
}
