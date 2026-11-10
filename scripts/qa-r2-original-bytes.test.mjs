import {test} from "node:test";
import assert from "node:assert/strict";
import {Readable} from "node:stream";
import {createHash} from "node:crypto";
import {expectedDamKey,qaDatabaseEndpointMatches,verifyPdfStream,
  inspectExistingQaDam,MAX_BYTES} from "./qa-r2-original-bytes.mjs";
const sha=createHash("sha256").update("%PDF-1.7\nExample private synthetic content\n").digest("hex");
const city="49dac0b6-6352-4744-9aab-9ff91c59d970";
const processId="1244ccaa-1111-4111-8111-123456abcdef";
const guideId="2244ccaa-1111-4111-8111-123456abcdef";
const row={id:guideId,municipality_id:city,process_id:processId,
  original_pdf_sha256:sha};

test("canonical DAM path can never be forged with another guide, SHA, or city",()=>{
  const key=expectedDamKey(row);
  assert.equal(key,"municipalities/"+city+"/processes/"+processId+
    "/dam-originals/"+guideId+"/"+sha+".pdf");
  assert.equal(expectedDamKey({...row,original_pdf_sha256:"invalid"}),null);
  assert.equal(expectedDamKey({...row,municipality_id:"not-a-uuid"}),null);
});
test("Postgres connection must belong to the exact preview Data API endpoint",()=>{
  const api="https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/rest/v1";
  assert.equal(qaDatabaseEndpointMatches(
    "postgres://fake:fake@ep-misty-breeze-b4ri8ig0.c-6.us-east-2.aws.neon.tech/qa",api),true);
  assert.equal(qaDatabaseEndpointMatches(
    "postgres://fake:fake@ep-misty-breeze-b4ri8ig0-pooler.c-6.us-east-2.aws.neon.tech/qa",api),true);
  assert.equal(qaDatabaseEndpointMatches(
    "postgres://fake:fake@ep-blue-cloud-b4hhgb4t.c-6.us-east-2.aws.neon.tech/qa",api),false);
  assert.equal(qaDatabaseEndpointMatches("postgres://invalid","https://not-a-neon-api/"),false);
});
test("only the exact PDF bytes pass; no text, truncated, reordered or oversized file",async()=>{
  const bytes=Buffer.from("%PDF-1.7\nExample private synthetic content\n");
  assert.equal(await verifyPdfStream(Readable.from([bytes.subarray(0,2),
    bytes.subarray(2,3),bytes.subarray(3,7),bytes.subarray(7)]),sha),true);
  assert.equal(await verifyPdfStream(Readable.from([bytes.subarray(2)]),sha),false);
  assert.equal(await verifyPdfStream(Readable.from([bytes,Buffer.from("tamper")]),sha),false);
  assert.equal(await verifyPdfStream(Readable.from([Buffer.alloc(MAX_BYTES+1)]),sha),false);
  assert.equal(await verifyPdfStream(null,sha),false);
});
test("never contacts QA bank or storage outside a protected preview",async()=>{
  assert.equal(await inspectExistingQaDam({VERCEL_ENV:"production",
    VERCEL_GIT_COMMIT_REF:"fix/qa-triagem-analise-pagamento-20261101"}),"NOT_VERIFIED_SCOPE");
  assert.equal(await inspectExistingQaDam({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"main"}),
    "NOT_VERIFIED_SCOPE");
  assert.equal(await inspectExistingQaDam({VERCEL_ENV:"preview",
    VERCEL_GIT_COMMIT_REF:"fix/qa-triagem-analise-pagamento-20261101"}),
    "NOT_VERIFIED_CONFIG");
});
