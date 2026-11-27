import {currentQaPreview} from "./qa-runtime-scope.js";
import type {CertifiedDraftArchiveManifest} from "./certified-permit-draft-archive.js";
import type {prepareArchivedMunicipalDraft} from "./certified-permit-draft-service.js";
type Registry=Parameters<typeof prepareArchivedMunicipalDraft>[0]["registry"];
type Scope=Parameters<Registry["read"]>[0];
type Query=(text:string,values:unknown[])=>Promise<{rows:Record<string,unknown>[]}>;
const columns="municipality_id,process_id,request_id,artifact_type,snapshot_sha256,render_payload_sha256,original_sha256,original_size,prepared_pdf_sha256,prepared_size,byte_range_sha256";
const filter="municipality_id=$1 AND process_id=$2 AND request_id=$3 AND artifact_type=$4 AND snapshot_sha256=$5 AND render_payload_sha256=$6";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
function args(s:Scope){
 if(![s.municipalityId,s.processId,s.requestId].every(v=>typeof v==="string"&&uuid.test(v))||
 !["construction_permit","habite_se_permit"].includes(s.artifactType)||
 ![s.snapshotSha256,s.renderPayloadSha256].every(v=>typeof v==="string"&&hash.test(v)))throw Error("CERTIFIED_DRAFT_REGISTRY_SCOPE_INVALID");
 return [s.municipalityId,s.processId,s.requestId,s.artifactType,s.snapshotSha256,s.renderPayloadSha256];
}
function checkManifest(m:CertifiedDraftArchiveManifest){
 const path=["sandbox-only","certified-drafts",...args(m)].join("/");
 if(![m.originalSha256,m.preparedPdfSha256,m.byteRangeSha256].every(v=>typeof v==="string"&&hash.test(v))||
 !Number.isSafeInteger(m.originalSize)||!Number.isSafeInteger(m.preparedSize)||m.originalSize<64||m.preparedSize<=m.originalSize||m.preparedSize>33554432||
 m.environment!=="sandbox"||m.issuanceAuthorized!==false||
 m.originalKey!==path+"/original-"+m.originalSha256+".pdf"||m.preparedKey!==path+"/prepared-"+m.preparedPdfSha256+".pdf")throw Error("CERTIFIED_DRAFT_REGISTRY_MANIFEST_INVALID");
 return m;
}
function map(r:Record<string,unknown>):CertifiedDraftArchiveManifest{
 const s={municipalityId:String(r.municipality_id),processId:String(r.process_id),requestId:String(r.request_id),artifactType:String(r.artifact_type) as Scope["artifactType"],snapshotSha256:String(r.snapshot_sha256),renderPayloadSha256:String(r.render_payload_sha256)};
 const path=["sandbox-only","certified-drafts",...args(s)].join("/");
 const originalSha256=String(r.original_sha256),preparedPdfSha256=String(r.prepared_pdf_sha256);
 return checkManifest({...s,originalSha256,originalSize:Number(r.original_size),preparedPdfSha256,preparedSize:Number(r.prepared_size),byteRangeSha256:String(r.byte_range_sha256),originalKey:path+"/original-"+originalSha256+".pdf",preparedKey:path+"/prepared-"+preparedPdfSha256+".pdf",environment:"sandbox",issuanceAuthorized:false});
}
/** Private worker DB adapter. Supply an already authorized, scoped QA
 * connection; this module neither obtains credentials nor exposes an RPC.
 * No update/delete, no fallback to production, no signing authorization. */
export function privateQaDraftRegistry(query:Query,env:Record<string,string|undefined>=process.env):Registry{
 if(!currentQaPreview(env))throw Error("CERTIFIED_DRAFT_REGISTRY_QA_ONLY");
 const read:Registry["read"]=async(scope)=>{
  const r=await query("SELECT "+columns+" FROM private.certified_permit_draft_registry_v1 WHERE "+filter,args(scope));
  if(r.rows.length>1)throw Error("CERTIFIED_DRAFT_REGISTRY_INVALID");
  if(!r.rows.length)return null;
  const m=map(r.rows[0]);
  if(args(m).some((v,i)=>v!==args(scope)[i]))throw Error("CERTIFIED_DRAFT_REGISTRY_SCOPE_INVALID");
  return m;
 };
 return {read,async recordOnce(m){
  checkManifest(m);
  const existing=await read(m);
  if(existing)return existing;
  await query("INSERT INTO private.certified_permit_draft_registry_v1 ("+columns+") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING", [...args(m),m.originalSha256,m.originalSize,m.preparedPdfSha256,m.preparedSize,m.byteRangeSha256]);
  const stored=await read(m);
  if(!stored)throw Error("CERTIFIED_DRAFT_REGISTRY_NOT_RECORDED");
  return stored;
 }};
}
