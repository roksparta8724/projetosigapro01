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
 it("completes the synthetic authenticated PDF lifecycle and preserves exact bytes",async()=>{
  vi.stubEnv("NEON_DATA_API_URL","https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1");
  vi.stubEnv("AWS_ENDPOINT_URL_S3","https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech");
  vi.stubEnv("AWS_ACCESS_KEY_ID","nak_fake_qa_unit");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY","FAKE_QA_TEST_KEY_NO_REAL_STORAGE_123");
  const {createHash}=await import("node:crypto");
  const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/qa-lifecycle.pdf";
  const stored=new Map<string,Uint8Array>();
  const storageCalls:string[]=[];
  const rpcNames:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async (url:string,opts:{method?:string;body?:Uint8Array;headers?:Record<string,string>})=>{
    if(url.includes(".apirest.")){
      rpcNames.push(url.split("/rpc/")[1]||"");
      return new Response("true",{status:200,headers:{"Content-Type":"application/json"}});
    }
    const method=opts.method||"";
    storageCalls.push(method);
    expect(url).toContain("sigapro-qa-urban-documents");
    expect(opts.headers?.Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    if(method==="PUT"){
      const bytes=opts.body!;
      expect(opts.headers?.["x-amz-content-sha256"]).toBe(createHash("sha256").update(bytes).digest("hex"));
      stored.set(url,new Uint8Array(bytes));
      return new Response(null,{status:200});
    }
    if(method==="GET"){
      const bytes=stored.get(url);
      return bytes
        ?new Response(new Uint8Array(bytes),{status:200,headers:{"Content-Type":"application/pdf"}})
        :new Response(null,{status:404});
    }
    if(method==="DELETE"){
      stored.delete(url);
      return new Response(null,{status:204});
    }
    throw new Error("unexpected S3 method");
  }));
  const pdf=new Uint8Array(1024*1024+31);
  new TextEncoder().encodeInto("%PDF-1.7\n% SIGAPRO QA synthetic document\n",pdf);
  pdf[pdf.length-1]=42;
  const makeUrl=(route:string)=>"https://qa.invalid/"+route+"?objectKey="+encodeURIComponent(key);
  const auth={Authorization:"Bearer synthetic",Origin:"https://projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app"};
  const upload=await handler.fetch(new Request(makeUrl("upload"),{
    method:"POST",headers:{...auth,"Content-Type":"application/pdf"},body:pdf,
  }));
  expect(upload.status).toBe(200);
  expect((await upload.json()).objectKey).toBe(key);
  expect(stored.size).toBe(1);
  const read=await handler.fetch(new Request(makeUrl("read"),{headers:auth}));
  expect(read.status).toBe(200);
  expect(read.headers.get("Content-Type")).toBe("application/pdf");
  expect(read.headers.get("Cache-Control")).toBe("private, no-store");
  expect(new Uint8Array(await read.arrayBuffer())).toEqual(pdf);
  const deleted=await handler.fetch(new Request(makeUrl("object"),{method:"DELETE",headers:auth}));
  expect(deleted.status).toBe(200);
  expect((await deleted.json()).ok).toBe(true);
  expect(stored.size).toBe(0);
  const afterDelete=await handler.fetch(new Request(makeUrl("read"),{headers:auth}));
  expect(afterDelete.status).toBe(404);
  expect(storageCalls).toEqual(["PUT","GET","DELETE","GET"]);
  expect(rpcNames).toContain("qa_storage_process_tenant_access_v1");
  expect(rpcNames).toContain("can_write_process_analysis");
 }, 15000);
 it("blocks a nonresponsible analyst from writing even when authorized to read",async()=>{
  vi.stubEnv("NEON_DATA_API_URL","https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1");
  const calls:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async (url:string)=>{
    if(!url.includes(".apirest."))throw new Error("S3 must never be contacted");
    const name=url.split("/rpc/")[1]||"";
    calls.push(name);
    return new Response(name==="can_write_process_analysis"?"false":"true",{
      status:200,headers:{"Content-Type":"application/json"}
    });
  }));
  const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/protected.pdf";
  const body=new TextEncoder().encode("%PDF-1.7\n");
  const response=await handler.fetch(new Request("https://qa.invalid/upload?objectKey="+encodeURIComponent(key),{
    method:"POST",headers:{Authorization:"Bearer synthetic","Content-Type":"application/pdf"},body
  }));
  expect(response.status).toBe(403);
  expect(calls).toContain("qa_storage_process_tenant_access_v1");
  expect(calls).toContain("can_write_process_analysis");
 });
 it("rejects a document key whose municipality differs from its process", async () => {
  vi.stubEnv("NEON_DATA_API_URL","https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1");
  const called:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async (url:string)=>{
   called.push(url);
   if(url.endsWith("/rpc/has_tenant_access")) return new Response("true",{status:200,headers:{"Content-Type":"application/json"}});
   if(url.endsWith("/rpc/qa_storage_process_tenant_access_v1")) return new Response("false",{status:200,headers:{"Content-Type":"application/json"}});
   throw new Error("storage must not be reached after a tenant/process mismatch");
  }));
  const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/planta.pdf";
  const out=await handler.fetch(new Request("https://qa.invalid/read?objectKey="+encodeURIComponent(key),{headers:{Authorization:"Bearer synthetic"}}));
  expect(out.status).toBe(403);
  expect(called).toHaveLength(2);
  expect(called[1]).toContain("/rpc/qa_storage_process_tenant_access_v1");
 });
 it.each([
  ["photo.png","image/png",[137,80,78,71,13,10,26,10]],
  ["photo.jpg","image/jpeg",[255,216,255,224]],
  ["photo.webp","image/webp",[82,73,70,70,0,0,0,0,87,69,66,80]],
 ] as const)("authorizes and uploads synthetic %s image into private QA storage",async(filename,mime,magic)=>{
  vi.stubEnv("NEON_DATA_API_URL","https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1");
  vi.stubEnv("AWS_ENDPOINT_URL_S3","https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech");
  vi.stubEnv("AWS_ACCESS_KEY_ID","nak_fake_qa_unit");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY","FAKE_QA_TEST_KEY_NO_REAL_STORAGE_123");
  const sent:{method?:string;mime?:string}[]=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:{method?:string;headers?:Record<string,string>})=>{
    if(url.includes(".apirest."))return new Response("true",{status:200,headers:{"Content-Type":"application/json"}});
    sent.push({method:opts.method,mime:opts.headers?.["Content-Type"]});
    return new Response(null,{status:200});
  }));
  const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/"+filename;
  const bytes=new Uint8Array([...magic,1,2,3]);
  const res=await handler.fetch(new Request("https://qa.invalid/upload?objectKey="+encodeURIComponent(key),{
    method:"POST",headers:{Authorization:"Bearer synthetic","Content-Type":mime},body:bytes
  }));
  expect(res.status).toBe(200);
  expect(sent).toEqual([{method:"PUT",mime}]);
 });
 it("streams a private JPEG with explicit type and nosniff",async()=>{
  vi.stubEnv("NEON_DATA_API_URL","https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1");
  vi.stubEnv("AWS_ENDPOINT_URL_S3","https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech");
  vi.stubEnv("AWS_ACCESS_KEY_ID","nak_fake_qa_unit");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY","FAKE_QA_TEST_KEY_NO_REAL_STORAGE_123");
  const jpg=new Uint8Array([255,216,255,224,0,1,2,3]);
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:{method?:string})=>{
    if(url.includes(".apirest."))return new Response("true",{status:200,headers:{"Content-Type":"application/json"}});
    expect(opts.method).toBe("GET");
    return new Response(jpg,{status:200});
  }));
  const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/vistoria.jpg";
  const r=await handler.fetch(new Request("https://qa.invalid/read?objectKey="+encodeURIComponent(key),{
    headers:{Authorization:"Bearer synthetic"}
  }));
  expect(r.status).toBe(200);
  expect(r.headers.get("Content-Type")).toBe("image/jpeg");
  expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(new Uint8Array(await r.arrayBuffer())).toEqual(jpg);
 });
 it("rejects a disguised PNG without ever sending bytes to S3",async()=>{
  vi.stubEnv("NEON_DATA_API_URL","https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1");
  let stored=false;
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
    if(url.includes(".apirest."))return new Response("true",{status:200,headers:{"Content-Type":"application/json"}});
    stored=true;return new Response(null,{status:200});
  }));
  const key="municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/photo.png";
  const res=await handler.fetch(new Request("https://qa.invalid/upload?objectKey="+encodeURIComponent(key),{
    method:"POST",headers:{Authorization:"Bearer synthetic","Content-Type":"image/png"},body:new Uint8Array([255,216,255,0,1,2,3,4])
  }));
  expect(res.status).toBe(400);expect(stored).toBe(false);
 });
 it("rejects a forged object key before any database or storage I/O", async () => {
  const response=await handler.fetch(new Request("https://qa.invalid/upload?objectKey=../../secret.pdf",
    {method:"POST",headers:{Authorization:"Bearer synthetic"}}));
  expect(response.status).toBe(400);
 });
});
