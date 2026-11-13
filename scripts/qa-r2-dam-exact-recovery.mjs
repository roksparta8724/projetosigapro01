#!/usr/bin/env node
/**
 * QA-only recovery of an original DAM PDF *only from identical SHA-256 bytes*
 * already stored under this municipality's own Cloudflare R2 prefix.
 * Never creates a replacement or changes a paid guide record.
 * Actual restore is allowed ONLY when source PDF bytes match the
 * immutable Neon SHA, guide, municipality and process scope exactly.
 *
 * Output reveals statuses only, never keys, documents, tokens or URLs.
 */
import {createHash} from "node:crypto";
import pg from "pg";
import {
  S3Client,HeadObjectCommand,GetObjectCommand,ListObjectsV2Command,PutObjectCommand,
} from "@aws-sdk/client-s3";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {qaDatabaseEndpointMatches,expectedDamKey,verifyPdfStream,SHA256,UUID,MAX_BYTES}
  from "./qa-r2-original-bytes.mjs";

export const MAX_LISTED=2200;
const BRANCH="fix/qa-triagem-analise-pagamento-20261101";

export function candidateKeyMatches(key,row) {
  const prefix="municipalities/"+row.municipality_id+"/";
  if(typeof key!=="string"||!key.startsWith(prefix)||
     !key.toLowerCase().endsWith(".pdf")||key.length>1024)return false;
  const normalized=key.toLowerCase();
  return normalized.includes(row.id.toLowerCase())||
    normalized.includes(row.original_pdf_sha256.toLowerCase())||
    (normalized.includes(row.process_id.toLowerCase())&&
     /dam|guia|guide|recolhimento|archived|original|backup/.test(normalized));
}

export async function listScopedCandidates(client,bucket,row,limit=MAX_LISTED) {
  if(!row||!UUID.test(row.municipality_id)||!UUID.test(row.process_id)||
     !UUID.test(row.id)||!SHA256.test(row.original_pdf_sha256))
    return {status:"INVALID_SCOPE",items:[]};
  const prefix="municipalities/"+row.municipality_id+"/";
  const candidates=[];let count=0;let cursor=undefined;
  do{
    const response=await client.send(new ListObjectsV2Command({
      Bucket:bucket,Prefix:prefix,MaxKeys:Math.min(500,limit-count),
      ...(cursor?{ContinuationToken:cursor}:{}),
    }));
    const items=response.Contents||[];
    count+=items.length;
    for(const item of items)if(candidateKeyMatches(item.Key,row)&&
      (item.Size===undefined||item.Size>5&&item.Size<=MAX_BYTES))
      candidates.push({Key:item.Key,Size:item.Size});
    if(count>=limit && response.IsTruncated)return {status:"SCAN_LIMIT",items:candidates};
    cursor=response.IsTruncated?response.NextContinuationToken:undefined;
    if(response.IsTruncated&&!cursor)return {status:"SCAN_UNCERTAIN",items:candidates};
  }while(cursor);
  return {status:"SCANNED",items:candidates};
}

export async function identifyExactSource(client,bucket,row) {
  const result=await listScopedCandidates(client,bucket,row);
  if(result.status!=="SCANNED")return {status:result.status};
  const expected=expectedDamKey(row);
  for(const item of result.items.slice(0,45)){
    if(item.Key===expected)continue;
    try{
      const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:item.Key}));
      const storedSha=String(head.Metadata?.sha256||"").toLowerCase();
      const contentLength=Number(head.ContentLength||0);
      if(contentLength<6||contentLength>MAX_BYTES||
         (storedSha&&storedSha!==row.original_pdf_sha256))continue;
      const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:item.Key}));
      if(!await verifyPdfStream(result.Body,row.original_pdf_sha256))continue;
      return {status:"EXACT_SHA_SOURCE_FOUND",sourceKey:item.Key,size:contentLength};
    }catch{/* A candidate is not evidence until all exact bytes pass SHA. */}
  }
  if(result.items.length>45)return {status:"SCAN_UNCERTAIN"};
  return {status:"EXACT_SHA_SOURCE_NOT_FOUND"};
}

function checkQaConfig(env) {
  if(env.VERCEL_ENV!=="preview"||env.VERCEL_GIT_COMMIT_REF!==BRANCH)
    return "NOT_VERIFIED_SCOPE";
  const url=String(env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL||"");
  const api=String(env.VITE_NEON_DATA_API_URL||"");
  const endpoint=String(env.R2_ENDPOINT||"");
  const bucket=String(env.R2_BUCKET_DOCUMENTOS||"");
  if(!qaDatabaseEndpointMatches(url,api)||
    !/^https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com\/?$/.test(endpoint)||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)||
    !env.R2_ACCESS_KEY_ID||!env.R2_SECRET_ACCESS_KEY)return "NOT_VERIFIED_CONFIG";
  return "READY";
}

export async function searchAndRestoreQaOriginal(env=process.env) {
  const ready=checkQaConfig(env);
  if(ready!=="READY")return ready;
  let db;
  let row;
  try {
    db=new pg.Client({connectionString:env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL,
      connectionTimeoutMillis:7500,query_timeout:7500,statement_timeout:7500,
      application_name:"sigapro_qa_exact_dam_sha_recovery"});
    await db.connect();
    const resp=await db.query(
      "SELECT id,municipality_id,process_id,original_pdf_key,original_pdf_sha256 " +
      "FROM public.qa_r2_original_integrity_probe_v1()");
    row=resp.rows?.[0];
  }catch{return "NOT_VERIFIED_DB"}
  finally{try{await db?.end()}catch{}}
  const canonical=expectedDamKey(row);
  if(!canonical||row.original_pdf_key!==canonical)return "INTEGRITY_MISMATCH";
  const bucket=String(env.R2_BUCKET_DOCUMENTOS);
  const client=new S3Client({region:"auto",
    endpoint:String(env.R2_ENDPOINT).replace(/\/$/,""),maxAttempts:1,
    credentials:{accessKeyId:String(env.R2_ACCESS_KEY_ID),
      secretAccessKey:String(env.R2_SECRET_ACCESS_KEY)}});
  try{
    // Verify canonical first; a present but corrupt original is NEVER overwritten.
    try{
      const resp=await client.send(new GetObjectCommand({Bucket:bucket,Key:canonical}));
      return await verifyPdfStream(resp.Body,row.original_pdf_sha256)
        ?"ALREADY_PRESENT_VERIFIED":"INTEGRITY_MISMATCH";
    }catch(e){
      if(e?.$metadata?.httpStatusCode!==404 &&
        !["NotFound","NoSuchKey"].includes(String(e?.name||"")))
        return "NOT_VERIFIED_CANONICAL_ACCESS";
    }
    const found=await identifyExactSource(client,bucket,row);
    if(found.status!=="EXACT_SHA_SOURCE_FOUND")return found.status;
    // Source is a fully hashed byte-for-byte copy in the SAME municipality.
    // Verify bytes once more before copying, cap RAM and disallow overwrites.
    const download=await client.send(new GetObjectCommand({Bucket:bucket,Key:found.sourceKey}));
    const chunks=[];let total=0;const hasher=createHash("sha256");
    for await(const chunk of download.Body){
      const bytes=Buffer.from(chunk);total+=bytes.length;
      if(total>MAX_BYTES)return "INTEGRITY_MISMATCH";
      hasher.update(bytes);chunks.push(bytes);
    }
    const bytes=Buffer.concat(chunks);
    if(total!==found.size||bytes.subarray(0,5).toString("ascii")!=="%PDF-"||
       hasher.digest("hex")!==row.original_pdf_sha256)return "INTEGRITY_MISMATCH";
    try{
      await client.send(new PutObjectCommand({
        Bucket:bucket,Key:canonical,Body:bytes,
        ContentType:"application/pdf",IfNoneMatch:"*",
        Metadata:{sha256:row.original_pdf_sha256,qaoriginalrestored:"byte-identical"},
      }));
    }catch(e){
      if(e?.$metadata?.httpStatusCode!==412)return "RESTORE_WRITE_FAILED";
    }
    const restored=await client.send(new GetObjectCommand({Bucket:bucket,Key:canonical}));
    return await verifyPdfStream(restored.Body,row.original_pdf_sha256)
      ?"RESTORED_EXACT_ORIGINAL_VERIFIED":"INTEGRITY_MISMATCH";
  }catch{return "NOT_VERIFIED_R2_ERROR"}
  finally{client.destroy()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await searchAndRestoreQaOriginal();
  console.log("SIGAPRO_QA_DAM_EXACT_SHA_RECOVERY "+result);
  if(result==="INTEGRITY_MISMATCH"||result==="RESTORE_WRITE_FAILED")
    process.exitCode=2;
}
