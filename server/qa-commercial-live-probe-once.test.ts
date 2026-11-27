/**
 * Explicit, one-build integration probe using ONLY artificial QA documents.
 * No bank order, actual payment, customer data, production DB or historic PDF
 * mutation. One optional model request on the marked QA build; no retries.
 */
import {createHash,randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {describe,it,expect} from "vitest";
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand,DeleteObjectCommand} from "@aws-sdk/client-s3";
import {currentQaPreview} from "./qa-runtime-scope";
import {qaMpWebhookDatabaseUrl} from "./mp-qa-webhook";
import {assertQaWorkerLeastPrivilege} from "./mp-webhook-worker-privilege";
import {decryptPaymentAccessToken,testMercadoPagoToken} from "./municipal-payment";
import {resolveR2Endpoint} from "./r2-runtime";
import {createQa04ArchitecturalPdfBytes} from "../src/lib/qa04ArchitecturalFixture";
import {extractNativeArchitecturalPdf} from "./native-architectural-pdf";
import {benchmarkQa04ArchitecturalReadings} from "../src/lib/architecturalPdfReadings";
import {resolveVisualPdfProvider,extractVisualPdf} from "./architectural-pdf-provider";
const fullProbe=currentQaPreview(process.env)&&process.env.SIGAPRO_QA_COMMERCIAL_PROBE_ONCE==="true";
const enabled=fullProbe||(currentQaPreview(process.env)&&process.env.SIGAPRO_QA_PROVIDER_READONLY_ONCE==="true");
const emit=(name:string,status:string)=>console.log("SIGAPRO_COMMERCIAL_PROBE "+JSON.stringify({name,status}));
const get=(key:string)=>String(process.env[key]||"").trim();
const requireNode=createRequire(import.meta.url);
type Db={connect():Promise<void>;end():Promise<void>;query(sql:string,args:unknown[]):Promise<{rows:Array<Record<string,unknown>>}>};
const fixtureCity="49dac0b6-6352-4744-9aab-9ff91c59d970";
const digest=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
describe("Isolated real commercial integration evidence",()=>{
 (enabled?it:it.skip)("reads the independently generated architecture fixture locally",()=>{
   const reading=extractNativeArchitecturalPdf(new Uint8Array(createQa04ArchitecturalPdfBytes()));
   const comparison=benchmarkQa04ArchitecturalReadings(reading.readings);
   expect(comparison.total).toBe(3);expect(comparison.passed).toBe(3);expect(reading.automaticallyApproved).toBe(false);
   emit("native_pdf_reader","PASS_THREE_MEASUREMENTS_GENERATED_FIXTURE");
 });
 (enabled?it:it.skip)("checks the actual configured municipal sandbox credential with a read-only provider GET",async()=>{
  let url:string;
  try{url=qaMpWebhookDatabaseUrl()}catch{emit("bank_provider","NOT_VERIFIED_WORKER_CONFIG");return;}
  const pg=requireNode("pg") as {Client:new(options:Record<string,unknown>)=>Db};
  const db=new pg.Client({connectionString:url,connectionTimeoutMillis:6000,query_timeout:7000,statement_timeout:7000});
  try{
   await db.connect();await assertQaWorkerLeastPrivilege(db);
   const result=await db.query("SELECT public.mp_qa_webhook_connection_v1($1::uuid) AS config",[fixtureCity]);
   const config=result.rows[0]?.config as Record<string,unknown>|null|undefined;
   if(!config||config.municipality_id!==fixtureCity||config.environment!=="test"||config.provider!=="mercado_pago"){
    emit("bank_provider","NOT_VERIFIED_SANDBOX_CONFIG");return;
   }
   let token:string;
   try{token=decryptPaymentAccessToken(String(config.access_token_ciphertext||""))}
   catch{emit("bank_provider","FAIL_CREDENTIAL_DECRYPTION");return;}
   // GET only. Never issue or settle an order in a CI probe.
   try{
    const result=await testMercadoPagoToken(token);
    emit("bank_provider",result.ok&&result.pixAvailable&&result.boletoAvailable?"PASS_PIX_BOLETO_GET":
      result.ok&&result.pixAvailable?"PASS_PIX_GET":result.ok&&result.boletoAvailable?"PASS_BOLETO_GET":"NOT_VERIFIED_METHODS");
   }catch{emit("bank_provider","FAIL_PROVIDER_GET");}
  }catch(error){
   if(error instanceof Error&&error.message==="QA_WORKER_EXCESSIVE_PRIVILEGES")throw Error("QA_WORKER_EXCESSIVE_PRIVILEGES");
   emit("bank_provider","NOT_VERIFIED_DB");
  }finally{try{await db.end()}catch{/* no secrets */}}
 },30000);
 (fullProbe?it:it.skip)("stores and reopens newly generated synthetic PDF, verifies bytes and cleanup",async()=>{
  const endpoint=resolveR2Endpoint(),bucket=get("R2_BUCKET_DOCUMENTOS"),accessKeyId=get("R2_ACCESS_KEY_ID"),secretAccessKey=get("R2_SECRET_ACCESS_KEY");
  if(!/^https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com$/.test(endpoint)||!bucket||!accessKeyId||!secretAccessKey){
   emit("new_r2_pdf","NOT_VERIFIED_CONFIG");return;
  }
  const bytes=new Uint8Array(createQa04ArchitecturalPdfBytes()),sha=digest(bytes);
  const key="sigapro-qa-e2e-disposable/"+randomUUID()+"/synthetic-architecture-"+sha+".pdf";
  const s3=new S3Client({region:"auto",endpoint,maxAttempts:1,credentials:{accessKeyId,secretAccessKey}});
  let created=false;
  let failure:Error|undefined;
  let cleanupFailure=false;
  try{
   await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:"application/pdf",IfNoneMatch:"*",Metadata:{sha256:sha,qaonly:"true"}}),{abortSignal:AbortSignal.timeout(10000)});
   created=true;
   const head=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(10000)});
   const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(10000)});
   const actual=await object.Body?.transformToByteArray();
   if(!actual||head.ContentLength!==bytes.length||head.Metadata?.sha256!==sha||digest(actual)!==sha||Buffer.from(actual.subarray(0,5)).toString("ascii")!=="%PDF-"){
    emit("new_r2_pdf","FAIL_BYTE_INTEGRITY");throw Error("QA_R2_BYTE_MISMATCH");
   }
   emit("new_r2_pdf","PASS_PUT_HEAD_GET_SHA256");
   const reading=extractNativeArchitecturalPdf(actual);
   const report=benchmarkQa04ArchitecturalReadings(reading.readings);
   expect(report.total).toBe(3);expect(report.passed).toBe(3);expect(reading.automaticallyApproved).toBe(false);
   emit("native_pdf_reader","PASS_THREE_MEASUREMENTS_FROM_R2");
  }catch(error){
   emit("new_r2_pdf","FAIL_ROUNDTRIP");failure=Error(error instanceof Error&&error.message==="QA_R2_BYTE_MISMATCH"?"QA_R2_BYTE_MISMATCH":"QA_R2_ROUNDTRIP_FAILED");
  }finally{
   try{
    if(created){
     await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(10000)});
     try{
      await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(10000)});
      cleanupFailure=true;
     }catch(error){
      const e=error as {name?:string;$metadata?:{httpStatusCode?:number}};
      if(e.$metadata?.httpStatusCode!==404&&!["NotFound","NoSuchKey"].includes(String(e.name)))cleanupFailure=true;
     }
     emit("new_r2_pdf_cleanup",cleanupFailure?"FAIL":"PASS");
    }
   }catch{cleanupFailure=true;emit("new_r2_pdf_cleanup","FAIL");}finally{s3.destroy();}
  }
  if(cleanupFailure)throw Error("QA_R2_DISPOSABLE_CLEANUP_NOT_VERIFIED");
  if(failure)throw failure;
 },65000);
 (enabled?it:it.skip)("makes one visual inference on artificial architectural plan only",async()=>{
  const resolved=resolveVisualPdfProvider(get);
  if(get("SIGAPRO_AI_PDF_EXTERNAL_POLICY").toLowerCase()==="local_only"){emit("visual_ai","LOCAL_ONLY_POLICY");return;}
   if(get("SIGAPRO_AI_PDF_ENABLED").toLowerCase()==="false"){emit("visual_ai","DISABLED");return;}
   if(!resolved.enabled||!["claude","openai"].includes(resolved.provider.kind)){emit("visual_ai","NOT_VERIFIED_CONFIG");return;}
  try{
   const result=await extractVisualPdf(new Uint8Array(createQa04ArchitecturalPdfBytes()),"SIGAPRO-QA-SYNTHETIC-NO-LEGAL-VALUE.pdf",resolved.provider);
   const comparison=benchmarkQa04ArchitecturalReadings(result.readings);
   emit("visual_ai",result.source==="ai_pdf_visual"&&comparison.total===3&&comparison.passed===3&&!result.automaticallyApproved?
     "PASS_THREE_MEASUREMENTS_VISUAL":"FAIL_MEASUREMENT_EVIDENCE");
  }catch(error){
   const code=error instanceof Error?error.message:"";
   emit("visual_ai",["AI_PROVIDER_BILLING","AI_RATE_LIMIT","AI_PROVIDER_CREDENTIALS","AI_PROVIDER_MODEL_UNAVAILABLE","AI_INVALID_JSON","AI_INCOMPLETE","AI_EMPTY","PROVIDER_UNAVAILABLE"].includes(code)?code:"NOT_VERIFIED_PROVIDER_FAILURE");
  }
 },85000);
});
