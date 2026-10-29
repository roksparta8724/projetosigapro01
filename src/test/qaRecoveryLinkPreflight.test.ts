import { describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { readFileSync } from "node:fs";
import { verifyQaRecoverableDocumentBeforeLink } from "../lib/qaRecoveryLinkPreflight";

const pdf=new NodeBlob(["%PDF-1.7\nQA synthetic file\n%%EOF"],{type:"application/pdf"});
const input={objectKey:"municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/protocols/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/qa.pdf",fileName:"qa.pdf",size:pdf.size};
const read=vi.fn(async()=>"blob:https://qa.invalid/temporary");
const mocks=(blob=pdf)=>({
  fetchUrl:vi.fn(async()=>({ok:true,blob:async()=>blob} as unknown as Response)),
  revokeUrl:vi.fn(),
});
describe("SIGAPRO QA — never associate unreadable or forged recovered documents",()=>{
 it("requires a successful private blob read and releases it on success",async()=>{
   const dependencies=mocks();
   await expect(verifyQaRecoverableDocumentBeforeLink(input,read,dependencies)).resolves.toBeUndefined();
   expect(dependencies.fetchUrl).toHaveBeenCalledExactlyOnceWith("blob:https://qa.invalid/temporary",{cache:"no-store"});
   expect(dependencies.revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:https://qa.invalid/temporary");
 });
 it("refuses objects whose read access was denied before metadata mutation",async()=>{
   const denied=vi.fn(async()=>{throw new Error("ACCESS_DENIED");});
   const dependencies=mocks();
   await expect(verifyQaRecoverableDocumentBeforeLink(input,denied,dependencies)).rejects.toThrow("ACCESS_DENIED");
   expect(dependencies.fetchUrl).not.toHaveBeenCalled();
 });
 it("prevents linking an object with misleading S3 size and releases the blob",async()=>{
   const dependencies=mocks();
   await expect(verifyQaRecoverableDocumentBeforeLink({...input,size:input.size+1},read,dependencies)).rejects.toThrow("tamanho ou formato");
   expect(dependencies.revokeUrl).toHaveBeenCalledOnce();
 });
 it("rejects PDF names hiding HTML and does not trust browser Content-Type",async()=>{
   const spoof=new NodeBlob(["<html>fake QA PDF</html>"],{type:"application/pdf"});
   const dependencies=mocks(spoof);
   await expect(verifyQaRecoverableDocumentBeforeLink({...input,size:spoof.size},read,dependencies))
     .rejects.toThrow("assinatura de arquivo inválida");
   expect(dependencies.revokeUrl).toHaveBeenCalledOnce();
 });
 it("refuses public URLs, even when they respond successfully",async()=>{
   const dependencies=mocks();
   await expect(verifyQaRecoverableDocumentBeforeLink(input,async()=>"https://public.example/file.pdf",dependencies)).rejects.toThrow("privada");
   expect(dependencies.fetchUrl).not.toHaveBeenCalled();
 });
 it("runs the check before appendProcessDocuments in process recovery",()=>{
   const source=readFileSync("src/pages/saas/ProcessDetailPage.tsx","utf8");
   const start=source.indexOf("const handleRecoverStoredDocument");
   const end=source.indexOf("const handleUploadMissingDocument",start);
   const body=source.slice(start,end);
   expect(body.indexOf("verifyQaRecoverableDocumentBeforeLink(candidate")).toBeGreaterThan(-1);
   expect(body.indexOf("verifyQaRecoverableDocumentBeforeLink(candidate")).toBeLessThan(body.indexOf("await appendProcessDocuments("));
 });
});
