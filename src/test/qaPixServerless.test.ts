import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn(),settled:vi.fn(),secret:vi.fn(),rpc:vi.fn(),fetch:vi.fn()}));
vi.mock("../../server/guide-persistence.js",()=>({readStoredGuide:mocks.read}));
vi.mock("../../server/guide-settlement.js",()=>({isPersistedGuideSettled:mocks.settled}));
vi.mock("../../server/municipal-payment.js",()=>({resolveMercadoPagoMunicipalAccessToken:mocks.secret}));
vi.mock("../../server/municipal-storage.js",()=>({callDataApiRpc:mocks.rpc}));
vi.mock("../../src/lib/pix.js",()=>({isValidPixPayload:(s:string)=>s==="VALID_TEST_PIX_PAYLOAD"}));
vi.mock("../../server/qa-mp-pix-proof.js",()=>({signQaPixProof:()=>({
 _proof_epoch:1800000000,_proof_mac:"f".repeat(64)
})}));
import handler from "../../api/qa-mercadopago-pix";
const tenant="49dac0b6-6352-4744-9aab-9ff91c59d970";
const guideCode="DAM-PRE-20261027-TEST1234";
const guideId="11111111-1111-4111-8111-111111111111";
const reservation={id:"55555555-5555-4555-8555-555555555555",municipality_id:tenant,
 guide_id:guideId,guide_number:guideCode,amount:12.30,idempotency_key:"",
 state:"pending",order_id:null,qr_code:null,may_post:true};
async function request(action:"get"|"issue",opts:{auth?:string;tenant?:string}={}){
 let body:Record<string,unknown>={};
 const req={method:"POST",headers:{authorization:opts.auth??"Bearer SAFE_USER"},
  body:{municipalityId:opts.tenant??tenant,guideCode,action}};
 const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((s:string)=>{body=JSON.parse(s)})};
 await handler(req as never,res as never);
 return {status:res.statusCode,body};
}
beforeEach(()=>{
 vi.resetAllMocks();
 vi.stubEnv("VERCEL_ENV","preview");
 vi.stubEnv("VERCEL_GIT_COMMIT_REF","qa/sigapro-ia-logo-integrado-20261023");
 vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","true");
 vi.stubEnv("SIGAPRO_QA_MP_SETUP_OPT_IN","QA_ONLY_TEST_CREDENTIALS");
 vi.stubEnv("SIGAPRO_QA_MP_CHARGE_OPT_IN","QA_ONLY_TEST_ORDERS");
 mocks.settled.mockReturnValue(false);
 mocks.read.mockResolvedValue({id:guideId,guide_number:guideCode,municipality_id:tenant,amount:12.30});
 mocks.secret.mockResolvedValue({environment:"test",token:"SANDBOX_TOKEN"});
 mocks.rpc.mockImplementation(async(_req:unknown,fn:string,args:Record<string,unknown>)=>{
  if(fn==="qa_mp_pix_get_v1")return {ok:true,payload:null};
  if(fn==="qa_mp_pix_reserve_v2")
   return {ok:true,payload:{...reservation,idempotency_key:args._key}};
  if(fn==="qa_mp_pix_save_v2")return {ok:true,payload:{...reservation,
    idempotency_key:args._key,order_id:"ORDER_QA_PIX_1234",qr_code:"VALID_TEST_PIX_PAYLOAD",
    state:"issued"}};
  return {ok:false};
 });
 mocks.fetch.mockResolvedValue({
  ok:true,status:201,json:async()=>({
   id:"ORDER_QA_PIX_1234",external_reference:guideCode,total_amount:"12.30",
   status:"action_required",transactions:{payments:[{id:"PAY_1234",
    payment_method:{id:"pix",type:"bank_transfer",qr_code:"VALID_TEST_PIX_PAYLOAD"}}]}
  })
 });
 // Vitest jsdom AbortSignal lacks Node.js timeout(); the HTTP response is mocked.
 vi.stubGlobal("AbortSignal",{timeout:()=>new AbortController().signal});
 vi.stubGlobal("fetch",mocks.fetch);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
describe("serverless QA PIX is isolated and idempotent",()=>{
 it("requires preview QA branch and never reaches banking if production",async()=>{
  vi.stubEnv("VERCEL_ENV","production");
  expect((await request("issue")).status).toBe(404);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
 });
 it("rejects unsigned requests before tenant or database access",async()=>{
  expect((await request("issue",{auth:""})).status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled();
 });
 it("GET is read only and does not reserve an order",async()=>{
  const result=await request("get");
  expect(result.status).toBe(200);
  expect(result.body.ok).toBe(false);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls[0][1]).toBe("qa_mp_pix_get_v1");
  expect(mocks.fetch).not.toHaveBeenCalled();
 });
 it("blocks new PIX orders without explicit billing opt-in",async()=>{
  vi.stubEnv("SIGAPRO_QA_MP_CHARGE_OPT_IN","");
  expect((await request("issue")).status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
 });
 it("requires a matching guide tenant",async()=>{
  expect((await request("issue",{tenant:"c334d39c-3a77-464c-abd6-a3a539cceba1"})).status).toBe(403);
  expect(mocks.fetch).not.toHaveBeenCalled();
 });
 it("creates only one TEST order with stable idempotency then persists the QR",async()=>{
  const result=await request("issue");
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ok:true,sandboxOnly:true,environment:"test",
    qrCode:"VALID_TEST_PIX_PAYLOAD",orderId:"ORDER_QA_PIX_1234"});
  const calls=mocks.rpc.mock.calls.map(x=>x[1]);
  expect(calls).toEqual(["qa_mp_pix_reserve_v2","qa_mp_pix_save_v2"]);
  const [endpoint,opts]=mocks.fetch.mock.calls[0];
  expect(endpoint).toBe("https://api.mercadopago.com/v1/orders");
  expect(opts.method).toBe("POST");
  expect(opts.headers["X-Idempotency-Key"]).toBeUndefined();
  expect(mocks.rpc.mock.calls[0][2]).toMatchObject({_proof_epoch:1800000000});
  expect(mocks.rpc.mock.calls[1][2]._proof_mac).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.parse(opts.body).transactions.payments[0].payment_method)
   .toEqual({id:"pix",type:"bank_transfer"});
 });
 it("cannot create a second provider Order after first claim",async()=>{
  mocks.rpc.mockImplementation(async(_req:unknown,fn:string,args:Record<string,unknown>)=>{
   if(fn==="qa_mp_pix_reserve_v2")return {ok:true,payload:{...reservation,
    idempotency_key:args._key,may_post:false}};
   return {ok:false};
  });
  const response=await request("issue");
  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({code:"QA_PIX_ORDER_CREATION_UNCERTAIN"});
  expect(mocks.fetch).not.toHaveBeenCalled();
 });
 it("rejects provider amount discrepancy without saving",async()=>{
  mocks.fetch.mockResolvedValue({ok:true,status:201,json:async()=>({
   id:"ORDER_QA_PIX_1234",external_reference:guideCode,total_amount:"999.99",
   transactions:{payments:[]}
  })});
  const result=await request("issue");
  expect(result.status).toBe(409);
  expect(mocks.rpc.mock.calls.map(x=>x[1])).toEqual(["qa_mp_pix_reserve_v2"]);
 });
});