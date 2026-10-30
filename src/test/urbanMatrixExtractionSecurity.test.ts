import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const stubs=vi.hoisted(()=>({rpc:vi.fn(),env:vi.fn(),fetch:vi.fn()}));
vi.mock("../../server/municipal-storage.js",()=>({callDataApiRpc:stubs.rpc,readEnv:stubs.env}));
vi.mock("../../server/cloudflare-ai-provider.js",()=>({
 resolveCloudflareAiConfig:()=>({
  endpoint:"https://api.cloudflare.com/client/v4/accounts/placeholder/ai/v1/chat/completions",
  token:"fake-token",model:"@cf/zai-org/glm-4.7-flash",
 }),
}));
import {extractUrbanMatrixFromPage,validUrbanMatrixRequest} from "../../server/urban-matrix-extraction";
const city="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const textPage="ZM-ABC RECUO FRONTAL 7 metros, RECUO LATERAL 3 metros, USOS R1 são permitidos mediante avaliação prévia.";
const body={action:"urban-matrix-extract",quadro:"I",documentTitle:"lei complementar 379.pdf",pageNumber:36,pageText:textPage};
const profile={municipality_id:city,tenant_id:city,is_master:false,account_status:"active"};
async function call(user:Record<string,unknown>=profile,input:unknown=body) {
 let payload:Record<string,unknown>={};
 const req={method:"POST",headers:{authorization:"Bearer fake"}};
 const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((value:string)=>{payload=JSON.parse(value)})};
 await extractUrbanMatrixFromPage(req as never,res as never,user,input);
 return {status:res.statusCode,payload};
}
beforeEach(()=>{
 vi.resetAllMocks();stubs.rpc.mockResolvedValue({ok:true,status:200,payload:true});
 stubs.env.mockImplementation((key:string)=>key==="SIGAPRO_AI_PROVIDER"?"cloudflare":"configured");
 vi.stubGlobal("fetch",stubs.fetch);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("SIGAPRO AI Quadro I/II tenant isolation and fail-closed",()=>{
 it("requires real page text",()=>{
  expect(validUrbanMatrixRequest(body)?.quadro).toBe("I");
  expect(validUrbanMatrixRequest({...body,pageText:"fake"})).toBeNull();
  expect(validUrbanMatrixRequest({...body,pageNumber:0})).toBeNull();
 });
 it("rejects cross-tenant and master before any RPC",async()=>{
  expect((await call({...profile,tenant_id:other})).status).toBe(403);
  expect((await call({...profile,is_master:true})).status).toBe(403);
  expect(stubs.rpc).not.toHaveBeenCalled();expect(stubs.fetch).not.toHaveBeenCalled();
 });
 it("rejects unauthorized admin",async()=>{
  stubs.rpc.mockResolvedValue({ok:true,status:200,payload:false});
  expect((await call()).status).toBe(403);expect(stubs.fetch).not.toHaveBeenCalled();
 });
 it("discards AI hallucinations even when syntax is valid",async()=>{
  stubs.fetch.mockResolvedValue({ok:true,json:async()=>({
   choices:[{message:{content:JSON.stringify({candidates:[
    {kind:"numeric_index",metric:"front_setback_m",limit:7,rawValue:"7",source_excerpt:"ZM-ABC RECUO FRONTAL 7 metros, RECUO LATERAL 3 metros"},
    {kind:"numeric_index",metric:"floor_area_ratio",limit:17,rawValue:"17",source_excerpt:"Aproveitamento criado por IA sem fonte"},
   ]})}}],
  })});
  const r=await call();expect(r.status).toBe(200);
  expect(r.payload.candidates).toHaveLength(1);expect(r.payload.automaticallyActivated).toBe(false);
  expect(stubs.rpc).toHaveBeenCalledWith(expect.anything(),"is_urban_regulation_admin_v1",{_municipality_id:city});
  expect(stubs.fetch).toHaveBeenCalledOnce();
  expect((stubs.fetch.mock.calls[0][1] as {body:string}).body).not.toContain(other);
 });
 it("fails closed on corrupt AI output and limit",async()=>{
  stubs.fetch.mockResolvedValueOnce({ok:true,json:async()=>({choices:[{message:{content:"not-json"}}]})});
  expect((await call()).status).toBe(422);
  stubs.fetch.mockResolvedValueOnce({ok:false,status:429});
  expect((await call()).status).toBe(429);
 });
});
