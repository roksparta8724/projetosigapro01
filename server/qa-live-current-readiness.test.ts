/** Real read-only integration evidence for the active isolated preview.
 * Never executes in ordinary CI or production; no customer PDFs, bank calls,
 * credential output, writes or external inference. A missing integration
 * is reported explicitly, never converted into an acceptance.
 */
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {GetObjectCommand,HeadObjectCommand,S3Client} from "@aws-sdk/client-s3";
import {currentQaPreview} from "./qa-runtime-scope";
import {qaMpWebhookDatabaseUrl} from "./mp-qa-webhook";
import {assertQaWorkerLeastPrivilege} from "./mp-webhook-worker-privilege";
import {getR2EndpointCandidates} from "./r2-runtime";
import {extractNativeArchitecturalPdf} from "./native-architectural-pdf";
import {benchmarkQa04ArchitecturalReadings} from "../src/lib/architecturalPdfReadings";
import {resolveVisualPdfProvider} from "./architectural-pdf-provider";
const enabled=currentQaPreview(process.env)&&process.env.SIGAPRO_QA_LIVE_READONLY_CHECKS==="true";
const requireNode=createRequire(import.meta.url);
const emit=(name:string,status:string)=>console.log("SIGAPRO_QA_CURRENT_EVIDENCE "+JSON.stringify({name,status}));
const key="municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/qa-arquitetura/d5434b4e-e1f5-46fd-a95c-dedc9631d9d2/04697e67-66a4-469f-ae41-ac21dcbc6126-SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf";
const sha="98e9cd82f61412b6c8677fa5e35ab6e80d2e2dbfe31d3d3bdb376e5ef30f5d3a";
type Db={connect():Promise<void>;end():Promise<void>;query(sql:string,args:unknown[]):Promise<{rows:Array<Record<string,unknown>>}>};
describe("Live integration evidence, current QA preview only",()=>{
 (enabled?it:it.skip)("validates restricted worker on its real database connection",async()=>{
  let url:string;
  try{url=qaMpWebhookDatabaseUrl()}catch{emit("bank_worker","NOT_VERIFIED_CONFIG");return;}
  const pg=requireNode("pg") as {Client:new(options:Record<string,unknown>)=>Db};
  const db=new pg.Client({connectionString:url,connectionTimeoutMillis:6000,query_timeout:7000,statement_timeout:7000});
  try{
   await db.connect();
   await assertQaWorkerLeastPrivilege(db);
   const result=await db.query("SELECT current_database() AS name",[]);
   expect(result.rows[0]?.name).toBe("sigapro_migration_stage_20260923");
   emit("bank_worker","PASS_LEAST_PRIVILEGE_REAL_CONNECTION");
  }catch(error){
   if(error instanceof Error&&error.message==="QA_WORKER_EXCESSIVE_PRIVILEGES"){
    emit("bank_worker","FAIL_EXCESSIVE_PRIVILEGES");throw Error("QA_WORKER_EXCESSIVE_PRIVILEGES");
   }
   emit("bank_worker","NOT_VERIFIED_DB");
  }finally{try{await db.end()}catch{/* No secret output. */}}
 },18000);
 (enabled?it:it.skip)("checks real synthetic R2 bytes against persisted full SHA and local reader",async()=>{
  const get=(s:string)=>String(process.env[s]||"").trim();
  const bucket=get("R2_BUCKET_DOCUMENTOS"),accessKeyId=get("R2_ACCESS_KEY_ID"),secretAccessKey=get("R2_SECRET_ACCESS_KEY");
  if(!bucket||!accessKeyId||!secretAccessKey){emit("synthetic_r2_pdf","NOT_VERIFIED_CONFIG");return;}
  let bytes:Uint8Array|null=null;
  let mismatch=false;
  for(const endpoint of getR2EndpointCandidates()){
   const s3=new S3Client({region:"auto",endpoint,maxAttempts:1,credentials:{accessKeyId,secretAccessKey}});
   const abort=new AbortController(),deadline=setTimeout(()=>abort.abort(),8000);
   try{
    const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:abort.signal});
    if(head.ContentLength!==16575){mismatch=true;continue;}
    const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:abort.signal});
    const candidate=await object.Body?.transformToByteArray();
    if(candidate?.length===16575&&Buffer.from(candidate.subarray(0,5)).toString("ascii")==="%PDF-"&&
       createHash("sha256").update(candidate).digest("hex")===sha){bytes=candidate;break;}
    mismatch=true;
   }catch{/* Only fixed configured storage endpoints. */}finally{clearTimeout(deadline);s3.destroy();}
  }
  if(!bytes){emit("synthetic_r2_pdf",mismatch?"INTEGRITY_MISMATCH":"NOT_VERIFIED_STORAGE");return;}
  emit("synthetic_r2_pdf","PASS_FULL_SHA256");
  try{
   const reading=extractNativeArchitecturalPdf(bytes);
   const report=benchmarkQa04ArchitecturalReadings(reading.readings);
   emit("native_pdf_reader",report.passed===3&&report.total===3&&!reading.automaticallyApproved?
     "PASS_THREE_MEASUREMENTS":"NOT_VERIFIED_MEASUREMENTS");
  }catch{emit("native_pdf_reader","NOT_VERIFIED_READ");}
  const configured=resolveVisualPdfProvider(get);
  emit("visual_provider",configured.enabled&&configured.provider.kind!=="cloudflare"?
    "CONFIGURED_NOT_INFERENCE_PROOF":"NOT_VERIFIED_VISUAL_PROVIDER");
 },45000);
});
