import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
import handler from "../../functions/sigaproqa/index.js";
describe("SIGAPRO branch-pinned QA large PDF function", () => {
 it("refuses every object request without a user JWT", async () => {
  for (const [method,path] of [["POST","/upload"],["GET","/read"],["DELETE","/object"]] as const) {
   const request=new Request("https://qa.invalid"+path+"?objectKey=municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/protocols/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/doc.pdf",{method});
   const response=await handler.fetch(request);
   expect(response.status).toBe(401);
  }
 });
 it("denies CORS from the official domain", async () => {
  const response=await handler.fetch(new Request("https://qa.invalid/upload",{method:"OPTIONS",headers:{Origin:"https://sigapromunicipal.com.br"}}));
  expect(response.status).toBe(403);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
 });
 it("allows the stable QA preview origin to perform preflights only", async () => {
  const origin="https://projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app";
  const response=await handler.fetch(new Request("https://qa.invalid/upload",{method:"OPTIONS",headers:{Origin:origin}}));
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
 });
 it("handles a binary PDF stream without Content-Length and enforces auth before S3",async()=>{
  vi.stubEnv("NEON_DATA_API_URL","https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1");
  vi.stubEnv("AWS_ENDPOINT_URL_S3","https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech");
  vi.stubEnv("AWS_ACCESS_KEY_ID","nak_fake_qa_unit");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY","FAKE_QA_TEST_KEY_NO_REAL_STORAGE_123");
  const requests:Array<{kind:string;method:string;byteCount:number;header?:string}>=[];
  const fake=vi.fn(async(url:string,opts:{method?:string;headers?:Record<string,string>;body?:Uint8Array})=>{
    if(url.includes(".apirest."))return new Response("true",{status:200,headers:{"Content-Type":"application/json"}});
    requests.push({kind:"storage",method:opts.method||"",byteCount:opts.body?.byteLength||0,header:opts.headers?.Authorization});
    return new Response(null,{status:200});
  });
  vi.stubGlobal("fetch",fake);
  const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/planta.pdf";
  const bytes=new Uint8Array(3*1024*1024);
  new TextEncoder().encodeInto("%PDF-1.7",bytes);
  const req=new Request("https://qa.example/upload?objectKey="+encodeURIComponent(key),{
    method:"POST",headers:{"Authorization":"Bearer synthetic","Content-Type":"application/pdf"},body:bytes,
  });
  expect(req.headers.get("Content-Length")).toBeNull();
  const out=await handler.fetch(req);
  expect(out.status, JSON.stringify(await out.clone().json())).toBe(200);
  expect(requests).toHaveLength(1);
  expect(requests[0].byteCount).toBe(bytes.byteLength);
  expect(requests[0].method).toBe("PUT");
  expect(requests[0].header).toMatch(/^AWS4-HMAC-SHA256 /);
 });
 it("rejects a forged object key before any database or storage I/O", async () => {
  const response=await handler.fetch(new Request("https://qa.invalid/upload?objectKey=../../secret.pdf",
    {method:"POST",headers:{Authorization:"Bearer synthetic"}}));
  expect(response.status).toBe(400);
 });
});
