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
     rpc==="qa_storage_recovery_principals_v1"?[principal]:
     rpc==="get_current_profile_context"?{tenant_id:tenant,profile_id:principal}:
     rpc==="current_auth_subject"?principal:
     rpc==="current_profile_id"?principal:true;
   return new Response(JSON.stringify(value),{status:200,headers:{"Content-Type":"application/json"}});
  }
  const xml='<?xml version="1.0"?><ListBucketResult>'+
    '<Contents><Key>'+key+'</Key><LastModified>2026-10-24T00:00:00Z</LastModified><Size>12</Size></Contents>'+
    '<Contents><Key>municipalities/'+tenant+'/protocols/other/doc.pdf</Key><LastModified>2026-10-24T00:00:00Z</LastModified><Size>5</Size></Contents>'+
    '<IsTruncated>false</IsTruncated></ListBucketResult>';
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
 it("lists only the authenticated user's owner prefixes and the explicitly authorized process",async()=>{
  const calls=setup();
  const r=await handler.fetch(body({since:"2026-10-20T00:00:00Z",processId}));
  expect(r.status).toBe(200);
  const result=await r.json() as {files:Array<{objectKey:string}>;storageProvider:string};
  expect(result.storageProvider).toBe("neon_qa_function");
  expect(result.files.map(x=>x.objectKey)).toEqual([key]);
  const remote=calls.filter(x=>x.url.includes(".storage."));
  expect(remote).toHaveLength(3);
  for(const x of remote){
    expect(x.opts.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    const u=new URL(x.url);
    expect(u.pathname).toBe("/sigapro-qa-urban-documents");
    expect(u.searchParams.get("list-type")).toBe("2");
    expect(u.searchParams.get("prefix")).toMatch(
      new RegExp("^municipalities/"+tenant+"/(?:(?:protocols|habite-se)/"+principal+"|processes/"+processId+")/")
    );
  }
 });
 it("includes years-old process attachments by default without weakening personal inbox search",async()=>{
  setup();
  const original=globalThis.fetch;
  const older="municipalities/"+tenant+"/processes/"+processId+"/historic-2022.pdf";
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:any)=>{
    if(url.includes(".apirest."))return original(url,opts);
    const pref=new URL(url).searchParams.get("prefix");
    return new Response(pref?.endsWith("/processes/"+processId+"/")
      ? '<ListBucketResult><Contents><Key>'+older+'</Key><Size>33</Size><LastModified>2022-08-11T10:00:00Z</LastModified></Contents><IsTruncated>false</IsTruncated></ListBucketResult>'
      : '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',{status:200});
  }));
  const scoped=await handler.fetch(body({processId}));
  expect(scoped.status).toBe(200);
  expect((await scoped.json()).files.map((x:{objectKey:string})=>x.objectKey)).toEqual([older]);
  const inbox=await handler.fetch(body());
  expect(inbox.status).toBe(200);
  expect((await inbox.json()).files).toEqual([]);
 });
 it.each([null,123,"not-a-date","1968-01-01T00:00:00Z"])(
    "rejects malformed or negative recovery date %s instead of hiding historical files",async since=>{
      const calls=setup();
      const response=await handler.fetch(body({processId,since}));
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("INVALID_RECOVERY_DATE");
      expect(calls.every(x=>x.url.includes(".apirest."))).toBe(true);
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
  expect(remote).toHaveLength(4);
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
 it("encodes RFC3986 special continuation tokens consistently with the SigV4 URL",async()=>{
  setup();
  const original=globalThis.fetch;
  const token="opaque~token+one two!'()*";
  const seen:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:any)=>{
    if(url.includes(".apirest."))return original(url,opts);
    seen.push(url);
    if(new URL(url).searchParams.has("continuation-token"))
      return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',{status:200});
    const prefix=new URL(url).searchParams.get("prefix")||"";
    return new Response('<ListBucketResult><IsTruncated>'+
      (prefix.includes("/protocols/")?"true":"false")+
      '</IsTruncated><NextContinuationToken>'+token.replace("&","&amp;")+
      '</NextContinuationToken></ListBucketResult>',{status:200});
  }));
  const r=await handler.fetch(body({since:"2026-10-20T00:00:00Z"}));
  expect(r.status).toBe(200);
  const page=seen.find(x=>new URL(x).searchParams.has("continuation-token"));
  expect(page).toBeDefined();
  expect(page).toContain("continuation-token=opaque~token%2Bone%20two%21%27%28%29%2A");
  expect(page).not.toContain("one+two");
  expect(new URL(page!).searchParams.get("continuation-token")).toBe(token);
 });
 it.each([
  ["missing IsTruncated",'<ListBucketResult><Contents><Key>municipalities/'+tenant+'/protocols/'+principal+'/file.pdf</Key><Size>9</Size><LastModified>2026-10-24T00:00:00Z</LastModified></Contents></ListBucketResult>'],
  ["missing Size",'<ListBucketResult><Contents><Key>municipalities/'+tenant+'/protocols/'+principal+'/file.pdf</Key><LastModified>2026-10-24T00:00:00Z</LastModified></Contents><IsTruncated>false</IsTruncated></ListBucketResult>'],
  ["unclosed Contents",'<ListBucketResult><Contents><Key>municipalities/'+tenant+'/protocols/'+principal+'/file.pdf</Key><Size>9</Size><LastModified>2026-10-24T00:00:00Z</LastModified><IsTruncated>false</IsTruncated></ListBucketResult>'],
  ["unclosed root",'<ListBucketResult><IsTruncated>false</IsTruncated>'],
 ] as const)("rejects %s in the S3 listing rather than silently hiding files",async(_name,xml)=>{
  setup();
  const original=globalThis.fetch;
  let storageCalls=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:any)=>{
    if(url.includes(".apirest."))return original(url,opts);
    storageCalls++;
    return new Response(xml,{status:200});
  }));
  const response=await handler.fetch(body({since:"2026-10-20T00:00:00Z"}));
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("QA_STORAGE_UNAVAILABLE");
  expect(storageCalls).toBeGreaterThan(0);
 });
 it("recovers a signed process document only after checking its municipality and process access",async()=>{
  const calls=setup();
  const original=globalThis.fetch;
  const document="municipalities/"+tenant+"/processes/"+processId+"/vistoria/photo.jpg";
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:any)=>{
    if(url.includes(".apirest."))return original(url,opts);
    calls.push({url,opts});
    const prefix=new URL(url).searchParams.get("prefix")||"";
    const xml=prefix.endsWith("/processes/"+processId+"/")
      ? '<ListBucketResult><Contents><Key>'+document+'</Key><LastModified>2026-10-25T00:00:00Z</LastModified><Size>493</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>'
      : '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>';
    return new Response(xml,{status:200});
  }));
  const r=await handler.fetch(body({processId,since:"2026-10-20T00:00:00Z"}));
  expect(r.status).toBe(200);
  const payload=await r.json() as {files:Array<{objectKey:string}>};
  expect(payload.files.map(x=>x.objectKey)).toEqual([document]);
  const check=calls.find(x=>x.url.endsWith("/rpc/qa_storage_process_tenant_access_v1"));
  expect(check).toBeDefined();
  expect(JSON.parse(check!.opts.body)).toMatchObject({_process_id:processId,_tenant_id:tenant});
  expect(calls.filter(x=>x.url.includes(".storage."))).toHaveLength(3);
 });
 it("fails explicitly instead of silently dropping document 251",async()=>{
  setup();
  const original=globalThis.fetch;
  const prefix="municipalities/"+tenant+"/protocols/"+principal+"/";
  let requested=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:any)=>{
    if(url.includes(".apirest."))return original(url,opts);
    requested++;
    const parsed=new URL(url),requestedPrefix=parsed.searchParams.get("prefix");
    if(requestedPrefix!==prefix)
      return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',{status:200});
    const page=parsed.searchParams.has("continuation-token")?250:0;
    const count=page===250?1:250;
    const rows=Array.from({length:count},(_,i)=>'<Contents><Key>'+prefix+'qa_'+(page+i)+'.pdf</Key><LastModified>2026-10-24T00:00:00Z</LastModified><Size>15</Size></Contents>').join("");
    return new Response('<ListBucketResult>'+rows+
      '<IsTruncated>'+(page===250?'false':'true')+'</IsTruncated>'+
      (page===250?'':'<NextContinuationToken>next-250</NextContinuationToken>')+
      '</ListBucketResult>',{status:200});
  }));
  const r=await handler.fetch(body({since:"2026-10-20T00:00:00Z"}));
  expect(r.status).toBe(409);
  expect((await r.json()).code).toBe("QA_RECOVERY_RESULT_LIMIT");
  expect(requested).toBe(3);
 });
 it("recovers original applicant files for an authorized municipal analyst, never analyst's own protocol files",async()=>{
  const calls=setup();
  const original=globalThis.fetch;
  const creator="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const orphan="municipalities/"+tenant+"/protocols/"+creator+"/planta.pdf";
  vi.stubGlobal("fetch",vi.fn(async(url:string,opts:any)=>{
    if(url.includes(".apirest.")){
      if(url.endsWith("/rpc/qa_storage_recovery_principals_v1")){
        calls.push({url,opts});
        return new Response(JSON.stringify([creator]),{status:200,headers:{"Content-Type":"application/json"}});
      }
      return original(url,opts);
    }
    calls.push({url,opts});
    const prefix=new URL(url).searchParams.get("prefix");
    const xml=prefix==="municipalities/"+tenant+"/protocols/"+creator+"/"
      ? '<ListBucketResult><Contents><Key>'+orphan+'</Key><LastModified>2026-10-25T00:00:00Z</LastModified><Size>20</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>'
      : '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>';
    return new Response(xml,{status:200});
  }));
  const response=await handler.fetch(body({processId,since:"2026-10-20T00:00:00Z"}));
  expect(response.status).toBe(200);
  const data=await response.json() as {files:Array<{objectKey:string}>};
  expect(data.files.map(x=>x.objectKey)).toEqual([orphan]);
  const storageCalls=calls.filter(x=>x.url.includes(".storage."));
  expect(storageCalls).toHaveLength(3);
  expect(storageCalls.some(x=>
    new URL(x.url).searchParams.get("prefix")==="municipalities/"+tenant+"/protocols/"+principal+"/"
  )).toBe(false);
  expect(calls.some(x=>x.url.endsWith("/rpc/qa_storage_recovery_principals_v1"))).toBe(true);
 });
 it("fails closed when scoped process creator identities are absent or invalid",async()=>{
  const calls=setup(["qa_storage_recovery_principals_v1"]);
  const r=await handler.fetch(body({processId}));
  expect(r.status).toBe(403);
  expect(calls.every(x=>x.url.includes(".apirest."))).toBe(true);
 });
 it("denies when the tenant authorization is rejected",async()=>{
  const calls=setup(["has_tenant_access"]);
  const r=await handler.fetch(body());
  expect(r.status).toBe(403);
  expect(calls.every(x=>x.url.includes(".apirest."))).toBe(true);
 });
});
