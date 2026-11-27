import {describe,it,expect,vi} from "vitest";
import {createHash} from "node:crypto";
import type {S3Client} from "@aws-sdk/client-s3";
import {assertStoredDocumentBytes} from "./document-storage-integrity";
const pdf=Buffer.from("%PDF-1.7\nQA sample\n%%EOF\n");
const sha=(v:Buffer)=>createHash("sha256").update(v).digest("hex");
const input={bucket:"qa-test",objectKey:"private/revision.pdf",expectedSha256:sha(pdf),expectedBytes:pdf.length,contentType:"application/pdf",maxBytes:1024,requirePdf:true};
function client(chunks:Buffer[],length=pdf.length,type="application/pdf"){
 return {send:vi.fn(async()=>({ContentLength:length,ContentType:type,Body:(async function*(){yield* chunks;})()}))};
}
describe("R2 stored document actual byte verification",()=>{
 it("checks the real bytes even across chunk boundaries",async()=>{
  const s=client([pdf.subarray(0,2),pdf.subarray(2)]);
  await expect(assertStoredDocumentBytes(s as unknown as S3Client,input)).resolves.toEqual({sha256:sha(pdf),fileSizeBytes:pdf.length});
 });
 it("rejects altered, truncated, oversized and wrong MIME objects",async()=>{
  const tampered=Buffer.from(pdf);tampered[9]^=1;
  await expect(assertStoredDocumentBytes(client([tampered]) as unknown as S3Client,input)).rejects.toThrow("HASH_MISMATCH");
  await expect(assertStoredDocumentBytes(client([pdf.subarray(0,8)]) as unknown as S3Client,input)).rejects.toThrow("HASH_MISMATCH");
  await expect(assertStoredDocumentBytes(client([pdf,Buffer.from("extra")]) as unknown as S3Client,input)).rejects.toThrow("SIZE_MISMATCH");
  await expect(assertStoredDocumentBytes(client([pdf],pdf.length,"text/html") as unknown as S3Client,input)).rejects.toThrow("METADATA_MISMATCH");
 });
 it("denies invalid scope before contacting storage",async()=>{
  const s=client([pdf]);
  await expect(assertStoredDocumentBytes(s as unknown as S3Client,{...input,maxBytes:1})).rejects.toThrow("INVALID_CONTRACT");
  expect(s.send).not.toHaveBeenCalled();
 });
});
