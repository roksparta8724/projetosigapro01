import { createHash } from "node:crypto";
import { describe,it,expect } from "vitest";
import { inspectPreparedPdfSignature,embedUnverifiedPkcs7,assertEmbeddedCmsBytes,type PreparedSignatureRange } from "./certified-pdf-byte-range";
const sha=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
function fixture(){
 const prefix="%PDF-1.7\n1 0 obj\n<< /Type /Sig /ByteRange [0000000000 0000000000 0000000000 0000000000] /Contents ";
 const tail=" >>\nendobj\n%%EOF\n";
 const start=prefix.length,end=start+4098;
 const range:PreparedSignatureRange=[0,start,end,tail.length];
 const head=prefix.replace("0000000000 0000000000 0000000000 0000000000",range.map(n=>String(n).padStart(10,"0")).join(" "));
 return {pdf:Buffer.from(head+"<"+"0".repeat(4096)+">"+tail),range};
}
describe("Prepared PDF ByteRange integrity",()=>{
 it("hashes the precise signed bytes and embeds without changing any covered byte",()=>{
  const {pdf,range}=fixture();const p=inspectPreparedPdfSignature(pdf,range,sha(pdf));
  const expected=sha(Buffer.concat([pdf.subarray(0,range[1]),pdf.subarray(range[2])]));
  expect(p.byteRangeSha256).toBe(expected);
  const output=embedUnverifiedPkcs7(pdf,range,sha(pdf),expected,Buffer.alloc(32,0x30));
  expect(output.verified).toBe(false);
  expect(output.bytes.length).toBe(pdf.length);
  expect(output.bytes.subarray(0,range[1])).toEqual(pdf.subarray(0,range[1]));
  expect(output.bytes.subarray(range[2])).toEqual(pdf.subarray(range[2]));
  expect(output.sha256).not.toBe(sha(pdf));
 });
 it("rejects replaced PDF, wrong range, invalid hash, and oversized CMS",()=>{
  const {pdf,range}=fixture();const p=inspectPreparedPdfSignature(pdf,range,sha(pdf));
  const modified=Buffer.from(pdf);modified[12]^=1;
  expect(()=>inspectPreparedPdfSignature(modified,range,sha(pdf))).toThrow(/HASH/);
  expect(()=>inspectPreparedPdfSignature(pdf,[0,range[1],range[2],0],sha(pdf))).toThrow(/RANGE/);
  expect(()=>embedUnverifiedPkcs7(pdf,range,sha(pdf),"0".repeat(64),Buffer.alloc(32,0x30))).toThrow(/HASH/);
  expect(()=>embedUnverifiedPkcs7(pdf,range,sha(pdf),p.byteRangeSha256,Buffer.alloc(2049,0x30))).toThrow(/CMS/);
 });
 it("rejects reuse of a populated signature slot",()=>{
  const {pdf,range}=fixture();pdf[range[1]+1]=49;
  expect(()=>inspectPreparedPdfSignature(pdf,range,sha(pdf))).toThrow(/NOT_EMPTY/);
 });
});

describe("Final PDF serialization",()=>{
 it("rejects changed signed bytes, replaced CMS, padding and trailing revisions",()=>{
  const {pdf,range}=fixture(), p=inspectPreparedPdfSignature(pdf,range,sha(pdf)), cms=Buffer.alloc(32,0x30);
  const signed=embedUnverifiedPkcs7(pdf,range,sha(pdf),p.byteRangeSha256,cms).bytes;
  const input={preparedBytes:pdf,signedBytes:signed,range,preparedSha256:sha(pdf),byteRangeSha256:p.byteRangeSha256,cmsDer:cms};
  expect(assertEmbeddedCmsBytes(input)).toMatchObject({sha256:sha(signed),embeddedCmsVerified:true,pdfPolicyVerified:false,issuanceAuthorized:false});
  for(const offset of [12,range[1]+1,range[1]+100,range[2]-1,range[2]]){
   const changed=Buffer.from(signed);changed[offset]^=1;
   expect(()=>assertEmbeddedCmsBytes({...input,signedBytes:changed})).toThrow();
  }
  expect(()=>assertEmbeddedCmsBytes({...input,signedBytes:Buffer.concat([signed,Buffer.from("\n%%EOF")])})).toThrow();
 });
});
