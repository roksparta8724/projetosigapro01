#!/usr/bin/env node
/**
 * QA-only live Cloudflare R2 write -> head -> read all bytes -> SHA-256 ->
 * delete -> 404 probe. No app data, credentials, or file names are logged.
 *
 * This proves storage mechanics, NOT user-file permissions or AI reading.
 * It is skipped outside the exact isolated QA Vercel Preview branch.
 * If credentials are missing, returns NOT_VERIFIED_CONFIG, never PASS.
 * If the configured QA R2 fails, the preview build fails closed.
 */
import {randomUUID,createHash} from "node:crypto";
import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,
  DeleteObjectCommand} from "@aws-sdk/client-s3";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {qaDatabaseEndpointMatches} from "./qa-r2-original-bytes.mjs";

export function isIsolatedQaScope(env=process.env) {
  // Use the same pairwise QA Neon database/data-API attestation already
  // proven by the read-only original-PDF inspector; absolute URL shape
  // varies by Neon endpoint generation and must not falsely skip the test.
  return env.VERCEL_ENV==="preview" &&
    env.VERCEL_GIT_COMMIT_REF==="fix/qa-triagem-analise-pagamento-20261101" &&
    qaDatabaseEndpointMatches(
      String(env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL||""),
      String(env.VITE_NEON_DATA_API_URL||"")
    );
}
export function makeQaPdf() {
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const words="SIGAPRO QA R2 BYTE ROUNDTRIP - FICTIONAL DOCUMENT - NO LEGAL VALUE";
  const stream="BT /F1 11 Tf 40 790 Td ("+words+") Tj ET\n";
  objects.push("<< /Length "+Buffer.byteLength(stream)+" >>\nstream\n"+stream+"endstream");
  let body="%PDF-1.4\n";const offsets=[0];
  objects.forEach((content,i)=>{offsets.push(Buffer.byteLength(body));body+=(i+1)+" 0 obj\n"+content+"\nendobj\n"});
  const xref=Buffer.byteLength(body);
  body+="xref\n0 6\n0000000000 65535 f \n";
  for(let i=1;i<=5;i++) body+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  body+="trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n"+xref+"\n%%EOF\n";
  return Buffer.from(body);
}
export function inspectConfig(env=process.env) {
  if(!isIsolatedQaScope(env))return "NOT_VERIFIED_SCOPE";
  const endpoint=String(env.R2_ENDPOINT||"").trim();
  const bucket=String(env.R2_BUCKET_DOCUMENTOS||"").trim();
  if(!/^https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com\/?$/.test(endpoint) ||
     !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
     !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)
    return "NOT_VERIFIED_CONFIG";
  return "READY";
}
async function hashR2Stream(body,expectedLength,expectedSha256) {
  if(!body || !body[Symbol.asyncIterator])throw Error("R2_BODY_NOT_STREAM");
  const hash=createHash("sha256");let size=0;let header=Buffer.alloc(0);
  for await(const chunk of body) {
    const part=Buffer.from(chunk);
    size+=part.length;
    if(size>256*1024)throw Error("R2_BODY_TOO_LARGE");
    if(header.length<5)header=Buffer.concat([header,part.subarray(0,5-header.length)]);
    hash.update(part);
  }
  if(size!==expectedLength || header.toString("ascii")!=="%PDF-" ||
     hash.digest("hex")!==expectedSha256)throw Error("R2_BYTES_MISMATCH");
}
export async function checkR2QaRoundtrip(env=process.env) {
  const readiness=inspectConfig(env);
  if(readiness!=="READY")return readiness;
  const endpoint=String(env.R2_ENDPOINT).replace(/\/$/,"");
  const bucket=String(env.R2_BUCKET_DOCUMENTOS);
  const client=new S3Client({region:"auto",endpoint,
    credentials:{accessKeyId:String(env.R2_ACCESS_KEY_ID),
      secretAccessKey:String(env.R2_SECRET_ACCESS_KEY)},maxAttempts:1});
  const key="sigapro-qa-e2e-disposable/"+randomUUID()+"/roundtrip.pdf";
  const bytes=makeQaPdf();const sha=createHash("sha256").update(bytes).digest("hex");
  let uploaded=false;
  try {
    // One ephemeral QA object only. Never touch any municipality key.
    await client.send(new PutObjectCommand({
      Bucket:bucket,Key:key,Body:bytes,ContentType:"application/pdf",
      Metadata:{sha256:sha,qaonly:"true"},IfNoneMatch:"*",
    }));
    uploaded=true;
    const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
    if(Number(head.ContentLength)!==bytes.length ||
       head.ContentType!=="application/pdf" ||
       head.Metadata?.sha256!==sha)throw Error("R2_HEAD_MISMATCH");
    const got=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
    await hashR2Stream(got.Body,bytes.length,sha);
    return "PASS";
  } catch(e) {
    const code=String(e?.name||"");
    return /AccessDenied|Forbidden|SignatureDoesNotMatch|InvalidAccessKeyId/.test(code)
      ? "FAIL_CREDENTIALS" : "FAIL_STORAGE_ROUNDTRIP";
  } finally {
    // Delete the exact newly issued key even on SHA error. If deletion fails,
    // fail the test and log only a sanitized code, never tenant/object names.
    try {
      if(uploaded) {
        await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
        try {
          await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
          throw Error("R2_QA_OBJECT_NOT_DELETED");
        } catch(e) {
          if(e?.message==="R2_QA_OBJECT_NOT_DELETED")throw e;
          if(e?.$metadata?.httpStatusCode!==404 &&
             !["NotFound","NoSuchKey"].includes(String(e?.name||"")))
            throw Error("R2_QA_DELETE_NOT_VERIFIED");
        }
      }
    } finally { client.destroy(); }
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const status=await checkR2QaRoundtrip();
    console.log("SIGAPRO_QA_R2_ROUNDTRIP "+status);
    if(status!=="PASS")process.exitCode=2;
  }catch {
    console.log("SIGAPRO_QA_R2_ROUNDTRIP FAIL_CLEANUP");
    process.exitCode=2;
  }
}
