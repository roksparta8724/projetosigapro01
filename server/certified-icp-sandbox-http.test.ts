import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import handler from "./certified-icp-sandbox-http";
import {startSandboxFlow,finishSandboxFlow} from "./certified-icp-sandbox-flow";
import type {ApiReq} from "./municipal-storage";
import type {ServerResponse} from "node:http";
vi.mock("./certified-icp-sandbox-flow",()=>({startSandboxFlow:vi.fn(),finishSandboxFlow:vi.fn()}));
const origin="https://qa.example.invalid";
const base={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"fix/homologacao-geral-sei-dashboard-bank-20261113",VITE_SIGAPRO_NEON_ISOLATED:"true",VITE_NEON_DATA_API_URL:"https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1",SIGAPRO_QA_ICP_HTTP_ENABLED:"true",SIGAPRO_QA_ICP_REDIRECT_URI:origin+"/api/certified-icp-sandbox"};
const selection={municipalityId:"11111111-1111-4111-8111-111111111111",profileId:"22222222-2222-4222-8222-222222222222",processId:"33333333-3333-4333-8333-333333333333",requestId:"44444444-4444-4444-8444-444444444444",artifactType:"construction_permit" as const,signerSlot:"diretoria" as const};
function req(method="POST",body:unknown={},headers:Record<string,string>={}){
 return {method,body,headers:{host:"qa.example.invalid",origin,authorization:"Bearer fictional",...headers},url:"/api/certified-icp-sandbox"} as ApiReq;
}
async function invoke(request:ApiReq){
 const headers:Record<string,string>={};let body="";
 const response={statusCode:200,setHeader:(name:string,value:string)=>{headers[name]=value;},end:(value:string)=>{body=value;}};
 await handler(request,response as unknown as ServerResponse);
 return {status:response.statusCode,headers,body,json:()=>JSON.parse(body)};
}
beforeEach(()=>{vi.resetAllMocks();for(const [k,v] of Object.entries(base))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());
describe("ICP sandbox HTTP contract",()=>{
 it("forbids production, foreign origins and missing authentication before any worker call",async()=>{
  vi.stubEnv("VERCEL_ENV","production");expect((await invoke(req())).status).toBe(404);
  vi.stubEnv("VERCEL_ENV","preview");expect((await invoke(req("POST",{action:"start"},{origin:"https://evil.invalid"}))).status).toBe(403);
  expect((await invoke(req("POST",{action:"start"},{authorization:""}))).status).toBe(401);
  expect((await invoke(req("POST",{action:"start"},{host:"evil.invalid"}))).status).toBe(403);
  expect(startSandboxFlow).not.toHaveBeenCalled();expect(finishSandboxFlow).not.toHaveBeenCalled();
 });
 it("serves callback without echoing sensitive query parameters, and no cache",async()=>{
  const r=req("GET");r.url+="?code=secret-example&state=secret-state";
  const result=await invoke(r);
  expect(result.status).toBe(200);expect(result.headers["Cache-Control"]).toBe("no-store");
  expect(result.headers["Content-Security-Policy"]).toContain("default-src 'none'");
  expect(result.body).not.toContain("secret-example");expect(result.body).not.toContain("secret-state");
  expect(result.body).toContain("history.replaceState");expect(result.body).toContain("location.origin");
 });
 it("routes start and completion and never transforms a failed manifest into success",async()=>{
  const start={authorizationUrl:"https://cas.staging.iti.br/oauth2.0/authorize",ticket:"fictional",state:"a".repeat(43),expiresAt:Date.now()+60000,environment:"sandbox",issuanceAuthorized:false};
  vi.mocked(startSandboxFlow).mockResolvedValueOnce(start);
  const first=await invoke(req("POST",{action:"start",...selection,extraneous:"not passed"}));
  expect(first.json()).toEqual({ok:true,...start});
  expect(startSandboxFlow).toHaveBeenCalledWith(expect.anything(),selection);
  const proof={objectKey:"sandbox-only/fixture.pdf",sha256:"b".repeat(64),fileSizeBytes:123,byteRangeSha256:"c".repeat(64),certificateSha256:"d".repeat(64),cmsSha256:"e".repeat(64),environment:"sandbox" as const,archiveVerified:true as const,pdfPolicyVerified:false as const,issuanceAuthorized:false as const,manifestRecorded:true};
  vi.mocked(finishSandboxFlow).mockResolvedValueOnce(proof);
  const input={ticket:start.ticket,state:start.state,code:"fixture-code"};
  const second=await invoke(req("POST",{action:"complete",...input}));
  expect(second.json()).toEqual({ok:true,...proof});
  vi.mocked(finishSandboxFlow).mockRejectedValueOnce(Error("sensitive provider details"));
  const failed=await invoke(req("POST",{action:"complete",...input}));
  expect(failed.status).toBe(409);expect(failed.json().ok).toBe(false);expect(failed.body).not.toContain("sensitive provider details");
 });
});
