import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {verifyPersistedPdfIntegrity} from "./document-pdf-integrity";

const bytes=new TextEncoder().encode("%PDF-1.7\nSIGAPRO integration fixture\n%%EOF\n");
const sha=createHash("sha256").update(bytes).digest("hex");

describe("Municipal PDF content integrity before external AI",()=>{
  it("accepts only matching exact SHA and size",()=>{
    expect(verifyPersistedPdfIntegrity(bytes,sha,bytes.byteLength)).toBe(sha);
    expect(verifyPersistedPdfIntegrity(bytes,sha.toUpperCase(),String(bytes.byteLength))).toBe(sha);
  });
  it("fails closed on missing or malformed canonical hash",()=>{
    for(const value of [undefined,null,"","ABCD","x".repeat(64)]){
      expect(()=>verifyPersistedPdfIntegrity(bytes,value,bytes.byteLength))
        .toThrow("PDF_HASH_UNAVAILABLE");
    }
  });
  it("rejects a changed file even when filename and byte count are unchanged",()=>{
    const tampered=new Uint8Array(bytes);
    tampered[12]=tampered[12]^1;
    expect(tampered.byteLength).toBe(bytes.byteLength);
    expect(()=>verifyPersistedPdfIntegrity(tampered,sha,bytes.byteLength))
      .toThrow("PDF_HASH_MISMATCH");
  });
  it("rejects missing, inconsistent and non-integer stored sizes",()=>{
    for(const size of [0,null,undefined,bytes.byteLength+1,"abc",3.5]){
      expect(()=>verifyPersistedPdfIntegrity(bytes,sha,size))
        .toThrow("PDF_SIZE_MISMATCH");
    }
  });
});
