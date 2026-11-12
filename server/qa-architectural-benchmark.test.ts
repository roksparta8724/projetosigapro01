import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {IncomingMessage,ServerResponse} from "node:http";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),bearer:vi.fn()}));
vi.mock("./municipal-storage.js",()=>({callDataApiRpc:mocks.rpc,readBearer:mocks.bearer}));
import handler,{qaBenchmarkEnabled} from "./qa-architectural-benchmark";
const municipality_id="49dac0b6-6352-4744-9aab-9ff91c59d970";
const request=(origin="https://qa.vercel.app")=>({method:"POST",
 headers:{host:"qa.vercel.app",origin}} as IncomingMessage);
function response(){let body="";const res={
 statusCode:200,setHeader:vi.fn(),end:(x:string)=>{body=x},
} as unknown as ServerResponse;return {res,read:()=>JSON.parse(body) as Record<string,unknown>};}
describe("SIGAPRO isolated QA technical PDF laboratory",()=>{
 beforeEach(()=>{
  vi.stubEnv("VERCEL_ENV","preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF","fix/qa-triagem-analise-pagamento-20261101");
  mocks.bearer.mockReturnValue("synthetic-jwt");
  mocks.rpc.mockResolvedValue({ok:true,payload:{municipality_id,tenant_id:municipality_id,
    role:"analista",account_status:"active"}});
 });
 afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks()});
 it("never runs outside exact preview branch",async()=>{
  vi.stubEnv("VERCEL_ENV","production");expect(qaBenchmarkEnabled()).toBe(false);
  const a=response();await handler(request(),a.res);expect(a.res.statusCode).toBe(404);
  vi.stubEnv("VERCEL_ENV","preview");vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
  const b=response();await handler(request(),b.res);expect(b.res.statusCode).toBe(404);
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("requires JWT, same origin, active analyst and municipal isolation",async()=>{
  mocks.bearer.mockReturnValueOnce("");
  const a=response();await handler(request(),a.res);expect(a.res.statusCode).toBe(401);
  const b=response();await handler(request("https://outside.test"),b.res);
  expect(b.res.statusCode).toBe(403);
  for(const actor of [{role:"prefeitura_admin"},{is_master:true},
    {tenant_id:"other"},{account_status:"blocked"}]){
   mocks.rpc.mockResolvedValueOnce({ok:true,payload:{municipality_id,
     tenant_id:municipality_id,role:"analista",account_status:"active",...actor}});
   const x=response();await handler(request(),x.res);expect(x.res.statusCode).toBe(403);
  }
 });
 it("actually parses in-memory PDF and returns three traceable setbacks",async()=>{
  const x=response();await handler(request(),x.res);
  expect(x.res.statusCode).toBe(200);
  const result=x.read();
  expect(result).toMatchObject({kind:"sigapro.qa04.synthetic-pdf.v1",status:"passed",
    summary:{passed:3,total:3,pagesRead:3},legalConformity:"not_evaluated",
    processUpdated:false,providerRequests:0});
  expect((result.cases as Array<{verified:boolean;readPage:number}>)
    .every(y=>y.verified&&y.readPage===2)).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
});
