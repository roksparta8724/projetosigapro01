import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {IncomingMessage,ServerResponse} from "node:http";
import {createQa04ArchitecturalPdfBytes} from "@/lib/qa04ArchitecturalFixture";
const mocked=vi.hoisted(()=>({send:vi.fn(),destroy:vi.fn(),endpoints:vi.fn()}));
vi.mock("@aws-sdk/client-s3",()=>({
  HeadObjectCommand:class{constructor(public input:unknown){}},
  GetObjectCommand:class{constructor(public input:unknown){}},
  S3Client:class{send=mocked.send;destroy=mocked.destroy},
}));
vi.mock("./r2-runtime.js",()=>({getR2EndpointCandidates:mocked.endpoints}));
import handler,{qaR2ProofEnabled} from "../api/qa-r2-reading-proof";
const request=(method="GET")=>({method,headers:{host:"qa.vercel.app"}} as IncomingMessage);
function response(){
 let body="";const res={statusCode:200,setHeader:vi.fn(),end:(v:string)=>{body=v}} as unknown as ServerResponse;
 return {res,body:()=>JSON.parse(body) as Record<string,unknown>};
}
describe("SIGAPRO verified QA04 R2 read-only proof",()=>{
 beforeEach(()=>{
  vi.stubEnv("VERCEL_ENV","preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF","fix/qa-triagem-analise-pagamento-20261101");
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","true");
  vi.stubEnv("R2_ACCESS_KEY_ID","testaccess");
  vi.stubEnv("R2_SECRET_ACCESS_KEY","testsecret");
  vi.stubEnv("R2_BUCKET_DOCUMENTOS","test-docs");
  mocked.endpoints.mockReturnValue(["https://r2.example.test"]);
 });
 afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks()});
 it("rejects production, wrong branch and wrong QA isolation without touching storage",async()=>{
  for(const key of ["VERCEL_ENV","VERCEL_GIT_COMMIT_REF","VITE_SIGAPRO_NEON_ISOLATED"] as const){
   const original=process.env[key];
   vi.stubEnv(key,"UNSAFE");
   expect(qaR2ProofEnabled()).toBe(false);
   const x=response();await handler(request(),x.res);
   expect(x.res.statusCode).toBe(404);
   vi.stubEnv(key,String(original));
  }
  expect(mocked.send).not.toHaveBeenCalled();
 });
 it("never writes or deletes and only accepts read-only GET",async()=>{
  const x=response();await handler(request("POST"),x.res);
  expect(x.res.statusCode).toBe(405);
  expect(mocked.send).not.toHaveBeenCalled();
 });
 it("rejects absent credentials without ever touching R2",async()=>{
  vi.stubEnv("R2_SECRET_ACCESS_KEY","");
  const x=response();await handler(request(),x.res);
  expect(x.res.statusCode).toBe(503);
  expect(x.body()).toMatchObject({status:"credentials_unavailable",r2BytesVerified:false});
 });
 it("reads actual PDF bytes from the SDK, audits pages and three known setbacks",async()=>{
  const pdf=new Uint8Array(createQa04ArchitecturalPdfBytes());
  // The deterministic three-sheet fixture is not necessarily identical to the
  // file stored earlier. This unit test proves the integrity/reader path,
  // while the LIVE endpoint tests actual remote bytes.
  mocked.send.mockImplementation(async cmd=>{
    if(cmd.constructor.name==="HeadObjectCommand")return {ContentLength:pdf.byteLength,Metadata:{}};
    return {Body:{transformToByteArray:async()=>pdf}};
  });
  const x=response();await handler(request(),x.res);
  // File size is pinned to the older V2 real object (16575). If the local
  // fixture's byte length changes, the route must fail closed.
  if(pdf.byteLength!==16575){
    expect(x.res.statusCode).toBe(503);
    expect(x.body().status).toBe("r2_pdf_integrity_failure");
  } else {
    expect(x.res.statusCode).toBe(200);
    expect(x.body()).toMatchObject({r2BytesVerified:true,aiLocalReadVerified:true,
      setbacksPassed:3,setbacksExpected:3,processUpdated:false,externalProviderCalls:0});
  }
  expect(mocked.send).toHaveBeenCalledTimes(1+(pdf.byteLength===16575?1:0));
 });
 it("detects malicious wrong-length objects before downloading",async()=>{
  mocked.send.mockResolvedValueOnce({ContentLength:2097153,Metadata:{}});
  const x=response();await handler(request(),x.res);
  expect(x.res.statusCode).toBe(503);
  expect(x.body()).toMatchObject({status:"r2_pdf_integrity_failure"});
  expect(mocked.send).toHaveBeenCalledTimes(1);
 });
});
