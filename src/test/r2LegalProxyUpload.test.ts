import {beforeEach,describe,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
const mock=vi.hoisted(()=>({rpc:vi.fn(),bearer:vi.fn(),target:vi.fn(),send:vi.fn(),endpoint:vi.fn()}));
vi.mock("../../server/municipal-storage.js",()=>({
 callDataApiRpc:mock.rpc,readBearer:mock.bearer,resolveMunicipalDocumentTarget:mock.target,
}));
vi.mock("../../server/r2-runtime.js",()=>({resolveR2Endpoint:mock.endpoint}));
vi.mock("@aws-sdk/client-s3",()=>{
 const Command=(kind:string)=>class {readonly kind=kind;constructor(public input:unknown){}};
 return {
  S3Client:class {send(command:unknown){return mock.send(command);}},
  AbortMultipartUploadCommand:Command("AbortMultipartUploadCommand"),
  CompleteMultipartUploadCommand:Command("CompleteMultipartUploadCommand"),
  CreateMultipartUploadCommand:Command("CreateMultipartUploadCommand"),
  DeleteObjectsCommand:Command("DeleteObjectsCommand"),
  GetObjectCommand:Command("GetObjectCommand"),
  HeadObjectCommand:Command("HeadObjectCommand"),
  PutObjectCommand:Command("PutObjectCommand"),
  UploadPartCommand:Command("UploadPartCommand"),
 };
});
import handler,{validateLegalChunkRequest,LEGAL_PROXY_CHUNK_BYTES} from "../../server/api/r2-legal-proxy-upload";
const tenant="11111111-1111-4111-8111-111111111111";
const actor="22222222-2222-4222-8222-222222222222";
const revision="33333333-3333-4333-8333-333333333333";
const key="municipalities/"+tenant+"/legislation-uso-solo/"+actor+"/"+revision+"-quadros.pdf";
const uploadId="44444444-4444-4444-8444-444444444444";
const first=Buffer.alloc(LEGAL_PROXY_CHUNK_BYTES,65);
first.write("%PDF-",0,"ascii");
const last=Buffer.from("END-OF-TEST-DOCUMENT","ascii");
const pieces=[first,last];
const size=first.length+last.length;
const sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
const fullSha=sha(Buffer.concat(pieces));
const base={bucket:"process-documents",objectKey:key,fileSize:size,contentType:"application/pdf",uploadId};
async function run(body:Record<string,unknown>,origin?:string,token="jwt"){
 let output:Record<string,unknown>={};
 const req={method:"POST",headers:{host:"preview.vercel.app",...(origin?{origin}:{})},body};
 mock.bearer.mockReturnValue(token);
 const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((raw:string)=>{output=JSON.parse(raw);})};
 await handler(req as never,res as never);
 return {status:res.statusCode,output};
}
beforeEach(()=>{
 vi.resetAllMocks();mock.target.mockResolvedValue(null);
 mock.endpoint.mockReturnValue("https://r2.example.com");
 vi.stubEnv("R2_ACCESS_KEY_ID","test");vi.stubEnv("R2_SECRET_ACCESS_KEY","test");
 mock.rpc.mockImplementation(async(_req:unknown,fn:string)=>({
  ok:true,status:200,payload:fn==="current_profile_id"?actor:
   fn==="can_manage_urban_legislation_registry_v1"?true:null,
 }));
});
describe("Server-only legal PDF upload without browser R2 CORS",()=>{
 it("denies untrusted tenants, origins and missing authentication",async()=>{
  const body={...base,action:"chunk",chunkIndex:0,chunkSha256:sha(first),base64:first.toString("base64")};
  expect(validateLegalChunkRequest(body)?.municipalityId).toBe(tenant);
  expect(validateLegalChunkRequest({...body,uploadId:"not-uuid"})).toBeNull();
  expect((await run(body,"https://evil.example")).status).toBe(403);
  expect((await run(body,undefined,"")).status).toBe(401);
  mock.rpc.mockImplementation(async(_req:unknown,fn:string)=>({
   ok:true,status:200,payload:fn==="current_profile_id"?actor:false,
  }));
  expect((await run(body)).status).toBe(403);
  expect(mock.send).not.toHaveBeenCalled();
 });
 it("uploads a valid 2MiB PDF part under a private staging key",async()=>{
  mock.send.mockResolvedValue({});
  const r=await run({...base,action:"chunk",chunkIndex:0,chunkSha256:sha(first),base64:first.toString("base64")});
  expect(r.status).toBe(200);
  expect(r.output).toMatchObject({ok:true,action:"chunk",index:0});
  expect(mock.send).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(mock.send.mock.calls[0][0])).toContain("private-legal-staging");
 });
 it("rejects an altered part before storing bytes",async()=>{
  const r=await run({...base,action:"chunk",chunkIndex:0,chunkSha256:"0".repeat(64),base64:first.toString("base64")});
  expect(r.status).toBe(400);
  expect(mock.send).not.toHaveBeenCalled();
 });
 it("combines chunks, verifies total SHA and cleans up staging objects",async()=>{
  const calls:string[]=[];
  mock.send.mockImplementation(async(cmd:{kind:string})=>{
   calls.push(cmd.kind);
   if(cmd.kind==="HeadObjectCommand"){
    if(calls.filter(x=>x==="HeadObjectCommand").length===1)
     throw {$metadata:{httpStatusCode:404}};
    return {ContentLength:size,ContentType:"application/pdf",Metadata:{sha256:fullSha}};
   }
   if(cmd.kind==="CreateMultipartUploadCommand")return {UploadId:"mp1"};
   if(cmd.kind==="GetObjectCommand"){
    const i=calls.filter(x=>x==="GetObjectCommand").length-1;
    const bytes=pieces[i];
    return {Body:{transformToByteArray:async()=>bytes},Metadata:{sha256:sha(bytes)}};
   }
   if(cmd.kind==="UploadPartCommand")return {ETag:"etag"};
   return {};
  });
  const r=await run({...base,action:"finalize",fileSha256:fullSha});
  expect(r.status).toBe(200);
  expect(r.output).toMatchObject({ok:true,objectKey:key});
  expect(calls).toContain("UploadPartCommand");
  expect(calls).toContain("CompleteMultipartUploadCommand");
  expect(calls).toContain("DeleteObjectsCommand");
 });
});
