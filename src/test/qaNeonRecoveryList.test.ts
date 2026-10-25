import {afterEach,describe,expect,it,vi} from "vitest";
import handler from "../../functions/sigaproqa/index.js";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const dataApi="https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";
const endpoint="https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech";
const tenant="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const principal="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const processId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const key="municipalities/"+tenant+"/protocols/"+principal+"/doc.pdf";
const body=(data?:object)=>new Request("https://qa.invalid/list-user-files",{
 method:"POST",headers:{Authorization:"Bearer test","Content-Type":"application/json"},
 body:JSON.stringify(data||{}),
});
function setup(deny:string[]=[]){
 vi.stubEnv("NEON_DATA_API_URL",dataApi);
 vi.stubEnv("AWS_ENDPOINT_URL_S3",endpoint);
 vi.stubEnv("AWS_ACCESS_KEY_ID","nak_fake_qa_unit");
 vi.stubEnv("AWS_SECRET_ACCESS_KEY","FAKE_QA_TEST_KEY_NO_REAL_STORAGE_123");
 const calls:{url:string;opts:any}[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,opts:any)=>{
  calls.push({url,opts});
  if(url.includes(".apirest.")){
   const rpc=url.split("/rpc/")[1];
   const value=deny.includes(rpc)?false:
     rpc==="get_current_profile_context"?{tenant_id:tenant,profile_id:principal}:
     rpc==="current_auth_subject"?principal:
     rpc==="current_profile_id"?principal:true;
   return new Response(JSON.stringify(value),{status:200,headers:{"Content-Type":"application/json"}});
  }
  const xml='<?xml version="1.0"?><ListBucketResult>'+
    '<Contents><Key>'+key+'</Key><LastModified>2026-10-24T00:00:00Z</LastModified><Size>12</Size></Contents>'+
    '<Contents><Key>municipalities/'+tenant+'/protocols/other/doc.pdf</Key><LastModified>2026-10-24T00:00:00Z</LastModified><Size>5</Size></Contents>'+
    '</ListBucketResult>';
  return new Response(xml,{status:200});
 }));
 return calls;
}
describe("SIGAPRO native Neon QA recovery list with real authorization guard",()=>{
 it("refuses anonymous, invalid and cross-municipality recovery before any S3 request",async()=>{
  const calls=setup(["qa_storage_process_tenant_access_v1"]);
  expect((await handler.fetch(new Request("https://qa.invalid/list-user-files",{method:"POST"}))).status).toBe(401);
  expect((await handler.fetch(body({processId:"not-a-uuid"}))).status).toBe(400);
  expect((await handler.fetch(body({processId}))).status).toBe(403);
  expect(calls.every(x=>x.url.includes(".apirest."))).toBe(true);
 });
 it("lists only the authenticated professional's protocol and Habite-se prefixes",async()=>{
  const calls=setup();
  const r=await handler.fetch(body({since:"2026-10-20T00:00:00Z",processId}));
  expect(r.status).toBe(200);
  const result=await r.json() as {files:Array<{objectKey:string}>;storageProvider:string};
  expect(result.storageProvider).toBe("neon_qa_function");
  expect(result.files.map(x=>x.objectKey)).toEqual([key]);
  const remote=calls.filter(x=>x.url.includes(".storage."));
  expect(remote).toHaveLength(2);
  for(const x of remote){
    expect(x.opts.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    const u=new URL(x.url);
    expect(u.pathname).toBe("/sigapro-qa-urban-documents");
    expect(u.searchParams.get("list-type")).toBe("2");
    expect(u.searchParams.get("prefix")).toMatch(
      new RegExp("^municipalities/"+tenant+"/(?:protocols|habite-se)/"+principal+"/")
    );
  }
 });
 it("recovers later S3 pages without including another professional's files",async()=>{
  const calls=setup();
  const priorFetch=globalThis.fetch;
  const nextKey="municipalities/"+tenant+"/protocols/"+principal+"/second.pdf";
  const secondPageToken="opaque+NEXT/2";
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:any)=>{
    if(url.includes(".apirest."))return priorFetch(url,opts);
    calls.push({url,opts});
    const search=new URL(url).searchParams;
    const prefix=search.get("prefix")||"";
    if(!prefix.includes("/protocols/"))
      return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',{status:200});
    if(search.has("continuation-token")){
      expect(search.get("continuation-token")).toBe(secondPageToken);
      return new Response('<ListBucketResult>'+
        '<Contents><Key>'+nextKey+'</Key><LastModified>2026-10-25T00:00:00Z</LastModified><Size>98</Size></Contents>'+
        '<Contents><Key>municipalities/'+tenant+'/protocols/other/hidden.pdf</Key>'+
        '<LastModified>2026-10-25T00:00:00Z</LastModified><Size>5</Size></Contents>'+
        '<IsTruncated>false</IsTruncated></ListBucketResult>',{status:200});
    }
    return new Response('<ListBucketResult>'+
      '<Contents><Key>'+key+'</Key><LastModified>2026-10-24T00:00:00Z</LastModified><Size>12</Size></Contents>'+
      '<IsTruncated>true</IsTruncated>'+
      '<NextContinuationToken>'+secondPageToken+'</NextContinuationToken>'+
      '</ListBucketResult>',{status:200});
  }));
  const r=await handler.fetch(body({since:"2026-10-20T00:00:00Z",processId}));
  expect(r.status).toBe(200);
  const data=await r.json() as {files:Array<{objectKey:string}>};
  expect(data.files.map(x=>x.objectKey)).toEqual([nextKey,key]);
  const remote=calls.filter(x=>x.url.includes(".storage."));
  expect(remote).toHaveLength(3);
  expect(remote.filter(x=>new URL(x.url).searchParams.has("continuation-token"))).toHaveLength(1);
 });
 it("rejects repeated opaque S3 continuation tokens instead of returning incomplete recovery",async()=>{
  setup();
  const original=globalThis.fetch;
  let calls=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:any)=>{
    if(url.includes(".apirest."))return original(url,opts);
    calls++;
    return new Response('<ListBucketResult><IsTruncated>true</IsTruncated>'+
      '<NextContinuationToken>duplicate-qa-page</NextContinuationToken></ListBucketResult>',{status:200});
  }));
  const r=await handler.fetch(body());
  expect(r.status).toBe(503);
  expect(calls).toBeLessThanOrEqual(4);
 });
 it("denies when the tenant authorization is rejected",async()=>{
  const calls=setup(["has_tenant_access"]);
  const r=await handler.fetch(body());
  expect(r.status).toBe(403);
  expect(calls.every(x=>x.url.includes(".apirest."))).toBe(true);
 });
});
