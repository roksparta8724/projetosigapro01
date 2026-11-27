import {createHash} from "node:crypto";
import {PutObjectCommand,S3Client} from "@aws-sdk/client-s3";
import {assertStoredDocumentBytes} from "./document-storage-integrity.js";
import {completeIcpSandboxCandidate,type IcpSandboxWorkerDependencies} from "./certified-icp-sandbox-worker.js";
import {currentQaPreview} from "./qa-runtime-scope.js";
type Candidate=Awaited<ReturnType<typeof completeIcpSandboxCandidate>>;
type Env=Record<string,string|undefined>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const hex=/^[a-f0-9]{64}$/;
const MAX=32*1024*1024;
/** Deliberately separate from the official DAM or municipal object namespace.
 * A dedicated account-scoped credential/bucket must be provisioned by the
 * infrastructure operator; never fall back to institutional R2 credentials. */
function archiveConfig(env:Env){
 const bucket=String(env.SIGAPRO_QA_CERTIFIED_BUCKET||"").trim();
 const account=String(env.SIGAPRO_QA_CERTIFIED_R2_ACCOUNT_ID||"").trim();
 const accessKeyId=String(env.SIGAPRO_QA_CERTIFIED_R2_ACCESS_KEY_ID||"").trim();
 const secretAccessKey=String(env.SIGAPRO_QA_CERTIFIED_R2_SECRET_ACCESS_KEY||"").trim();
 if(!currentQaPreview(env)||env.SIGAPRO_QA_CERTIFIED_ARCHIVE_ENABLED!=="true"||
    !/^sigapro-qa-certified-[a-z0-9][a-z0-9-]{1,32}$/.test(bucket)||bucket===env.R2_BUCKET_DOCUMENTOS||
    !/^[a-f0-9]{32}$/.test(account)||!accessKeyId||!secretAccessKey||
    accessKeyId===env.R2_ACCESS_KEY_ID||secretAccessKey===env.R2_SECRET_ACCESS_KEY)
   throw Error("ITI_SANDBOX_ARCHIVE_NOT_CONFIGURED");
 return {bucket,endpoint:"https://"+account+".r2.cloudflarestorage.com",credentials:{accessKeyId,secretAccessKey}};
}
/** Create-once archive of a cryptographically preflighted sandbox candidate.
 * The path/hash is not an official document, and no issuance is performed.
 * Never removes or overwrites an object; retries verify the stored bytes. */
export async function archiveIcpSandboxCandidate(candidate:Candidate,env:Env=process.env,clientOverride?:S3Client){
 const config=archiveConfig(env);
 if(candidate.issuanceAuthorized!==false||candidate.pdfPolicyVerified!==false||candidate.identityVerified!==true||candidate.cryptographicPreflightPassed!==true||
    ![candidate.municipalityId,candidate.processId,candidate.requestId,candidate.profileId].every(v=>uuid.test(v))||
    ![candidate.sha256,candidate.byteRangeSha256,candidate.cmsSha256,candidate.certificateSha256].every(v=>hex.test(v))||
    !["construction_permit","habite_se_permit"].includes(candidate.artifactType)||!["diretoria","secretaria"].includes(candidate.signerSlot)||
    candidate.bytes.length<64||candidate.bytes.length>MAX||sha(candidate.bytes)!==candidate.sha256||Buffer.from(candidate.bytes.subarray(0,5)).toString("ascii")!=="%PDF-")throw Error("ITI_SANDBOX_CANDIDATE_INVALID");
 const objectKey=["sandbox-only","certified-candidates",candidate.municipalityId,candidate.processId,candidate.requestId,candidate.profileId,candidate.artifactType,candidate.signerSlot,candidate.sha256+".pdf"].join("/");
 const client=clientOverride??new S3Client({region:"auto",endpoint:config.endpoint,credentials:config.credentials,maxAttempts:2});
 try{
  try{
   await client.send(new PutObjectCommand({Bucket:config.bucket,Key:objectKey,Body:candidate.bytes,ContentType:"application/pdf",IfNoneMatch:"*",Metadata:{"sha256":candidate.sha256,"status":"sandbox-candidate-not-issued"}}));
  }catch(error){
   const e=error as {name?:string;$metadata?:{httpStatusCode?:number}};
   if(e.name!=="PreconditionFailed"&&e.$metadata?.httpStatusCode!==412)throw error;
  }
  await assertStoredDocumentBytes(client,{bucket:config.bucket,objectKey,expectedSha256:candidate.sha256,expectedBytes:candidate.bytes.length,contentType:"application/pdf",maxBytes:MAX,requirePdf:true});
  return {objectKey,sha256:candidate.sha256,fileSizeBytes:candidate.bytes.length,byteRangeSha256:candidate.byteRangeSha256,certificateSha256:candidate.certificateSha256,cmsSha256:candidate.cmsSha256,environment:"sandbox" as const,archiveVerified:true as const,pdfPolicyVerified:false as const,issuanceAuthorized:false as const};
 }finally{if(!clientOverride)client.destroy();}
}
/** Check archive configuration before consuming the OAuth code/state.
 * Remaining production adapters and official PAdES issuance are not implied. */
export async function completeAndArchiveIcpSandboxCandidate(deps:IcpSandboxWorkerDependencies,input:Parameters<typeof completeIcpSandboxCandidate>[1],env:Env=process.env){
 archiveConfig(env);
 const candidate=await completeIcpSandboxCandidate(deps,input);
 return archiveIcpSandboxCandidate(candidate,env);
}
