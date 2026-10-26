import { createHash } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../functions/sigaproqa/index.js";

const tenant="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const processId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const guideId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const bytes=Buffer.from("%PDF-1.4\n% Immutable sandbox-only guide\n%%EOF");
const hash=createHash("sha256").update(bytes).digest("hex");
const key=`municipalities/${tenant}/processes/${processId}/dam-originals/${guideId}/${hash}.pdf`;
const origin="http://localhost:8081";
const url=(action,k=key)=>"https://qa.function.example/"+action+"?objectKey="+encodeURIComponent(k);
let stored,linked,permitted,order;
const calls=[];
beforeEach(()=>{
  vi.stubEnv("NEON_DATA_API_URL","https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1");
  vi.stubEnv("AWS_ENDPOINT_URL_S3","https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech");
  vi.stubEnv("AWS_ACCESS_KEY_ID","nak_qa_test");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY","local-only-stub-no-real-secret");
  stored=null;linked=false;permitted=true;order.length=0;
  vi.stubGlobal("fetch",vi.fn(async (input,options)=>{
    const target=new URL(String(input));
    if(target.pathname.includes("/rpc/")){
      const name=target.pathname.split("/").at(-1);
      const args=JSON.parse(String(options.body||"{}"));
      calls.push({type:"rpc",name,args});
      const data={
        has_tenant_access:permitted,
        authorize_payment_guide_original_upload_v2:permitted&&!linked,
        authorize_payment_guide_original_read_v1:permitted&&linked&&args._object_key===key,
      }[name]??false;
      return new Response(JSON.stringify(data),{status:200,headers:{"Content-Type":"application/json"}});
    }
    if(target.host.endsWith(".storage.c-6.us-east-2.aws.neon.tech")){
      const method=options.method;
      order.push({method,headers:options.headers});
      if(method==="PUT"){
        if(stored&&options.headers["if-none-match"]==="*")return new Response(null,{status:412});
        stored=Buffer.from(options.body);
        return new Response(null,{status:200});
      }
      if(method==="GET")return stored
        ?new Response(stored,{status:200})
        :new Response("Not Found",{status:404});
      if(method==="DELETE")return new Response(null,{status:204});
    }
    throw new Error("Unexpected network destination: "+target.hostname);
  }));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
async function invoke(action,{objectKey=key,payload=bytes,method=action==="upload"?"POST":action==="object"?"DELETE":"GET"}={}){
  return handler.fetch(new Request(url(action,objectKey),{
    method,
    headers:{"Authorization":"Bearer qa-isolated-session","Origin":origin,
      ...(method==="POST"?{"Content-Type":"application/pdf"}:{})},
    ...(method==="POST"?{body:payload}:{})
  }));
}
describe("Neon QA DAM originals: native storage and scoped access",()=>{
  it("uploads a single byte-identical SHA original using signed If-None-Match",async()=>{
    const result=await invoke("upload");
    expect(result.status).toBe(200);
    expect((await result.json()).objectKey).toBe(key);
    expect(stored.equals(bytes)).toBe(true);
    expect(order).toHaveLength(1);
    expect(order[0].method).toBe("PUT");
    expect(order[0].headers["if-none-match"]).toBe("*");
    expect(order[0].headers.Authorization).toContain("if-none-match");
    expect(calls.map(c=>c.name)).toContain("authorize_payment_guide_original_upload_v2");
    expect(calls).toContainEqual(expect.objectContaining({
      name:"authorize_payment_guide_original_upload_v2",
      args:{_guide_id:guideId,_municipality_id:tenant,_process_id:processId},
    }));
  });
  it("retries a successful upload without overwriting even one original byte",async()=>{
    expect((await invoke("upload")).status).toBe(200);
    const again=await invoke("upload");
    expect(again.status).toBe(200);
    expect((await again.json()).unchanged).toBe(true);
    expect(order.map(v=>v.method)).toEqual(["PUT","PUT","GET"]);
    expect(stored.equals(bytes)).toBe(true);
  });
  it("opens only Neon-linked guide originals and verifies the actual PDF hash",async()=>{
    expect((await invoke("upload")).status).toBe(200);
    expect((await invoke("read")).status).toBe(403);
    linked=true;
    const opened=await invoke("read");
    expect(opened.status).toBe(200);
    expect(Buffer.from(await opened.arrayBuffer()).equals(bytes)).toBe(true);
    stored=Buffer.from("%PDF-a-different-document");
    const corrupt=await invoke("read");
    expect(corrupt.status).toBe(409);
    expect((await corrupt.json()).code).toBe("QA_STORAGE_INTEGRITY_MISMATCH");
  });
  it("rejects SHA mismatch, path tricks and foreign guide keys before S3 writes",async()=>{
    const wrong=await invoke("upload",{payload:Buffer.from("%PDF-corrupted")});
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).code).toBe("QA_ORIGINAL_SHA_MISMATCH");
    const malformed=[
      key.replace(guideId,"../"+guideId),
      key.replace("/dam-originals/","/dam-originals/copy/"),
      key.replace("/dam-originals/","/dam-originals-backup/"),
      key.replace(guideId,"x"),
    ];
    for(const candidate of malformed){
      const r=await invoke("upload",{objectKey:candidate});
      expect(r.status).toBe(400);
    }
    expect(order).toHaveLength(0);
  });
  it("denies deletion, and any original upload lacking process-specific Neon permission",async()=>{
    expect((await invoke("object")).status).toBe(403);
    permitted=false;
    expect((await invoke("upload")).status).toBe(403);
    expect((await invoke("read")).status).toBe(403);
    expect(order).toHaveLength(0);
  });
  it("rejects malformed session and a foreign browser origin",async()=>{
    const unauthorized=await handler.fetch(new Request(url("upload"),{method:"POST",headers:{"Origin":origin}}));
    expect(unauthorized.status).toBe(401);
    const foreign=await handler.fetch(new Request(url("upload"),{method:"POST",
      headers:{"Origin":"https://sigapromunicipal.com.br","Authorization":"Bearer fake","Content-Type":"application/pdf"},body:bytes}));
    expect(foreign.status).toBe(403);
    expect(order).toHaveLength(0);
  });
});
