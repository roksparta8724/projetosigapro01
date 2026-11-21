import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {Readable} from "node:stream";
import {candidateKeyMatches,listScopedCandidates,identifyExactSource,MAX_LISTED}
  from "./qa-r2-dam-exact-recovery.mjs";

const bytes=Buffer.from("%PDF-1.7\nQA FICTIONAL ORIGINAL PDF - NEVER A LEGAL DOCUMENT\n%%EOF\n");
const digest=createHash("sha256").update(bytes).digest("hex");
const row={
  id:"2244ccaa-1111-4111-8111-123456abcdef",
  municipality_id:"49dac0b6-6352-4744-9aab-9ff91c59d970",
  process_id:"1244ccaa-1111-4111-8111-123456abcdef",
  original_pdf_sha256:digest,
};
const scope="municipalities/"+row.municipality_id+"/";
const alternate=scope+"processes/"+row.process_id+"/backup/"+row.id+"/"+digest+".pdf";

test("forensics rejects cross-city and unrelated objects",()=>{
  assert.equal(candidateKeyMatches(alternate,row),true);
  assert.equal(candidateKeyMatches("municipalities/00000000-0000-4000-8000-000000000000/"+row.id+"/"+digest+".pdf",row),false);
  assert.equal(candidateKeyMatches(scope+"private/random.pdf",row),false);
  assert.equal(candidateKeyMatches(scope+"backup/"+digest+".jpg",row),false);
  assert.equal(MAX_LISTED<=2500,true);
});
test("scoped R2 LIST never scans other city or unrestricted bucket",async()=>{
  const calls=[];
  const client={send:async cmd=>{
    calls.push(cmd.input);
    return {Contents:[{Key:alternate,Size:bytes.length}],IsTruncated:false};
  }};
  const r=await listScopedCandidates(client,"qa-docs",row);
  assert.equal(r.status,"SCANNED");
  assert.equal(r.items.length,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0].Prefix,scope);
  assert.equal(calls[0].MaxKeys<=500,true);
});
test("candidate is accepted only after readback hash matches immutable SHA",async()=>{
  const calls=[];
  const client={send:async cmd=>{
    calls.push(cmd.constructor.name);
    if(cmd.constructor.name==="ListObjectsV2Command")
      return {Contents:[{Key:alternate,Size:bytes.length}],IsTruncated:false};
    if(cmd.constructor.name==="HeadObjectCommand")
      return {ContentLength:bytes.length,Metadata:{sha256:digest}};
    if(cmd.constructor.name==="GetObjectCommand")
      return {Body:Readable.from([bytes.subarray(0,4),bytes.subarray(4)])};
    throw Error("Unexpected operation");
  }};
  const found=await identifyExactSource(client,"qa-docs",row);
  assert.equal(found.status,"EXACT_SHA_SOURCE_FOUND");
  assert.equal(found.sourceKey,alternate);
  assert.ok(!calls.includes("PutObjectCommand"));
});
test("same candidate is rejected if any bytes disagree",async()=>{
  const client={send:async cmd=>{
    if(cmd.constructor.name==="ListObjectsV2Command")
      return {Contents:[{Key:alternate,Size:bytes.length}],IsTruncated:false};
    if(cmd.constructor.name==="HeadObjectCommand")
      return {ContentLength:bytes.length,Metadata:{}};
    if(cmd.constructor.name==="GetObjectCommand")
      return {Body:Readable.from([Buffer.from(bytes.toString().replace("ORIGINAL","MODIFIED"))])};
    throw Error("Unexpected");
  }};
  assert.equal((await identifyExactSource(client,"qa-docs",row)).status,"EXACT_SHA_SOURCE_NOT_FOUND");
});
test("scan limit never reports a missing backup as exhaustive",async()=>{
  const client={send:async()=>({Contents:[{Key:alternate,Size:bytes.length}],IsTruncated:true,
    NextContinuationToken:"next"})};
  assert.equal((await listScopedCandidates(client,"qa-docs",row,1)).status,"SCAN_LIMIT");
});
