#!/usr/bin/env node
/**
 * SIGAPRO QA-only: verifies the bytes of an EXISTING, immutable DAM PDF in R2.
 * All database reads are SELECT. All R2 calls are GET. No uploaded file is
 * saved, disclosed, converted, or sent to an AI provider.
 *
 * Results: PASS, NOT_VERIFIED_CONFIG/DB/STORAGE/NO_ORIGINAL, INTEGRITY_MISMATCH.
 * NOT_VERIFIED is *not* an acceptance. A proven mismatch fails the QA build.
 */
import {createHash} from "node:crypto";
import pg from "pg";
import {GetObjectCommand,S3Client} from "@aws-sdk/client-s3";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

export const SHA256=/^[a-f0-9]{64}$/;
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const MAX_BYTES=25*1024*1024;

export function expectedDamKey(row) {
  if(!row || !UUID.test(String(row.id||"")) ||
      !UUID.test(String(row.municipality_id||"")) ||
      !UUID.test(String(row.process_id||"")) ||
      !SHA256.test(String(row.original_pdf_sha256||""))) return null;
  return "municipalities/"+row.municipality_id+"/processes/"+
    row.process_id+"/dam-originals/"+row.id+"/"+
    row.original_pdf_sha256+".pdf";
}
export function qaDatabaseEndpointMatches(dbUrl,dataApiUrl) {
  try {
    const dbHost=new URL(dbUrl).hostname;
    const apiHost=new URL(dataApiUrl).hostname;
    const apiIdentity=/^(ep-[a-z0-9-]+)\.apirest\./.exec(apiHost)?.[1];
    return Boolean(apiIdentity &&
      (dbHost===apiIdentity+".c-6.us-east-2.aws.neon.tech" ||
       dbHost.startsWith(apiIdentity+".") ||
       dbHost.startsWith(apiIdentity+"-pooler.")) &&
      !apiIdentity.includes("blue-cloud"));
  } catch { return false; }
}
export async function verifyPdfStream(body,expectedHash) {
  if(!body || !body[Symbol.asyncIterator] || !SHA256.test(expectedHash)) return false;
  const hash=createHash("sha256");
  let size=0,header=Buffer.alloc(0);
  for await(const chunk of body){
    const bytes=Buffer.from(chunk);
    size+=bytes.length;
    if(size>MAX_BYTES) return false;
    if(header.length<5) header=Buffer.concat([header,bytes.subarray(0,5-header.length)]);
    hash.update(bytes);
  }
  return size>5 && header.toString("ascii")==="%PDF-" &&
    hash.digest("hex")===expectedHash;
}

export async function inspectExistingQaDam(env=process.env) {
  if(env.VERCEL_ENV!=="preview" ||
     env.VERCEL_GIT_COMMIT_REF!=="fix/qa-triagem-analise-pagamento-20261101")
    return "NOT_VERIFIED_SCOPE";
  const dbUrl=String(env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL||"");
  const dataApi=String(env.VITE_NEON_DATA_API_URL||"");
  const endpoint=String(env.R2_ENDPOINT||"");
  const bucket=String(env.R2_BUCKET_DOCUMENTOS||"");
  if(!qaDatabaseEndpointMatches(dbUrl,dataApi) ||
     !/^https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com\/?$/.test(endpoint) ||
     !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
     !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return "NOT_VERIFIED_CONFIG";

  let db;
  let row;
  try {
    db=new pg.Client({connectionString:dbUrl,connectionTimeoutMillis:7500,
      query_timeout:7500,statement_timeout:7500,application_name:"sigapro_qa_r2_byte_audit"});
    await db.connect();
    const result=await db.query({
      // The bank webhook worker has NO direct SELECT privileges on municipal
      // tables. Use a narrowly scoped, one-row SECURITY DEFINER QA probe.
      text:"SELECT id,municipality_id,process_id,original_pdf_key,original_pdf_sha256 "+
        "FROM public.qa_r2_original_integrity_probe_v1()",rowMode:"array",
    });
    const values=result.rows?.[0];
    row=values?Object.fromEntries(
      ["id","municipality_id","process_id","original_pdf_key","original_pdf_sha256"]
        .map((key,i)=>[key,values[i]])):null;
  }catch{return "NOT_VERIFIED_DB";}
  finally{try{await db?.end()}catch{}}
  if(!row)return "NOT_VERIFIED_NO_ORIGINAL";
  if(expectedDamKey(row)!==row.original_pdf_key)return "INTEGRITY_MISMATCH";

  const storage=new S3Client({
    region:"auto",endpoint:endpoint.replace(/\/$/,""),
    credentials:{accessKeyId:String(env.R2_ACCESS_KEY_ID),
      secretAccessKey:String(env.R2_SECRET_ACCESS_KEY)},
    maxAttempts:1,
  });
  const controller=new AbortController();
  const deadline=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await storage.send(new GetObjectCommand({
      Bucket:bucket,Key:row.original_pdf_key,
    }),{abortSignal:controller.signal});
    const verified=await verifyPdfStream(response.Body,row.original_pdf_sha256);
    return verified?"PASS":"INTEGRITY_MISMATCH";
  }catch{return "NOT_VERIFIED_STORAGE";}
  finally{clearTimeout(deadline);storage.destroy()}
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await inspectExistingQaDam();
  // Do not print account identifiers, municipality, object key, URL, PDF, JWT or secrets.
  console.log("SIGAPRO_QA_R2_ORIGINAL_BYTES "+result);
  if(result==="INTEGRITY_MISMATCH")process.exitCode=2;
}
