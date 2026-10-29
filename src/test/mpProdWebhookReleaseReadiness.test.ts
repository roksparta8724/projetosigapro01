import {afterEach,describe,expect,it,vi} from "vitest";
import handler from "../../api/mercadopago-webhook";
import {fetchMunicipalMpOrder} from "../../server/mp-prod-order-observation";
const orderId="ORD01QA20261028VALID000000000001";
const paymentId="PAY01QA20261028VALID0000000001";
async function request(method:string,url="/api/mercadopago-webhook"){
 let body:Record<string,unknown>={};
 const req={method,url,headers:{},body:{}};
 const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((data:string)=>{body=JSON.parse(data)})};
 await handler(req as never,res as never);
 return {status:res.statusCode,body};
}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
describe("municipal production bank release fail-closed",()=>{
 it("denies the production banking route on a preview deployment",async()=>{
  vi.stubEnv("VERCEL_ENV","preview");vi.stubEnv("VERCEL_GIT_COMMIT_REF","release/prod-bank-20261029");
  const x=await request("GET");
  expect(x.status).toBe(503);expect(x.body.code).toBe("PRODUCTION_ONLY");
 });
 it("health on exact main deployment does not imply bank readiness",async()=>{
  vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
  vi.stubEnv("SIGAPRO_PROD_MP_WEBHOOK_DATABASE_URL","");
  const x=await request("GET");
  expect(x.status).toBe(200);
  expect(x.body).toMatchObject({ok:true,environment:"production",webhooksConfigured:false});
 });
 it("does not open a provider connection for an invalid tenant ID",async()=>{
  vi.stubEnv("VERCEL_ENV","production");vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
  const bank=vi.fn();vi.stubGlobal("fetch",bank);
  const x=await request("POST","/api/mercadopago-webhook?municipality_id=invalid");
  expect(x.status).toBe(400);expect(bank).not.toHaveBeenCalled();
 });
});
describe("release Orders observation: only accredited PIX can officialize",()=>{
 const base={id:orderId,external_reference:"DAM-PRE-TEST",currency:"BRL",country_code:"BRA",
  status:"processed",status_detail:"accredited",total_amount:"1.00",total_paid_amount:"1.00",
  transactions:{payments:[{id:paymentId,amount:"1.00",paid_amount:"1.00",status:"processed",
    status_detail:"accredited",payment_method:{id:"pix",type:"bank_transfer"}}],refunds:[],chargebacks:[]}};
 async function observe(payload:unknown){
  vi.stubGlobal("AbortSignal",{timeout:()=>new AbortController().signal});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify(payload),{status:200})));
  return fetchMunicipalMpOrder(orderId,"test-provider-token");
 }
 it("accepts one accredited PIX with exact amount",async()=>expect((await observe(base)).accredited).toBe(true));
 it("accepts an actually accredited boleto ticket with matching amount and payment ID",async()=>{
  const payload={...base,transactions:{...base.transactions,payments:[
    {...base.transactions.payments[0],payment_method:{id:"boleto",type:"ticket"}}]}};
  expect((await observe(payload)).accredited).toBe(true);
 });
 it("never accepts an unpaid boleto (action_required / waiting_payment)",async()=>{
  const payload={...base,status:"action_required",status_detail:"waiting_payment",
   total_paid_amount:"0.00",transactions:{...base.transactions,payments:[
    {...base.transactions.payments[0],status:"action_required",status_detail:"waiting_payment",
    paid_amount:"0.00",payment_method:{id:"boleto",type:"ticket"}}]}};
  expect((await observe(payload)).accredited).toBe(false);
 });
 it.each([{id:"visa",type:"credit_card"},{id:"ted",type:"bank_transfer"},
  {id:"boleto",type:"bank_transfer"},{id:"pix",type:"ticket"},null])("rejects other or mismatched payment methods %j",async method=>{
  const payload={...base,transactions:{...base.transactions,payments:[{...base.transactions.payments[0],payment_method:method}]}};
  expect((await observe(payload)).accredited).toBe(false);
 });
 it("rejects refunds, multiple payments and wrong order identity",async()=>{
  const payment=base.transactions.payments[0];
  expect((await observe({...base,transactions:{...base.transactions,refunds:[{id:"r1"}]}})).accredited).toBe(false);
  expect((await observe({...base,transactions:{...base.transactions,payments:[payment,payment]}})).accredited).toBe(false);
  expect((await observe({...base,id:"wrong-order"})).fetched).toBe(false);
 });
});

import {prodDatabaseUrl} from "../../server/mp-prod-webhook";
describe("Production webhook SSL guarantees",()=>{
  const expectedHost="ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech";
  afterEach(()=>vi.unstubAllEnvs());
  function configure(mode:string,host=expectedHost){
    vi.stubEnv("VERCEL_ENV","production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
    vi.stubEnv("SIGAPRO_PROD_MP_WEBHOOK_DATABASE_URL",
      `postgresql://sigapro_prod_webhook_worker:placeholder@${host}/sigapro_migration_stage_20260923?sslmode=${mode}`);
  }
  it("upgrades legacy require to verified certificate and hostname",()=>{
    configure("require");
    expect(new URL(prodDatabaseUrl()).searchParams.get("sslmode")).toBe("verify-full");
  });
  it("accepts explicit verify-full without weakening it",()=>{
    configure("verify-full");
    expect(new URL(prodDatabaseUrl()).searchParams.get("sslmode")).toBe("verify-full");
  });
  it("rejects unsafe SSL modes, wrong hosts and wrong branches",()=>{
    configure("disable");
    expect(()=>prodDatabaseUrl()).toThrow("PROD_BANK_DATABASE_BRANCH_OR_ROLE_MISMATCH");
    configure("require","staging.example.invalid");
    expect(()=>prodDatabaseUrl()).toThrow("PROD_BANK_DATABASE_BRANCH_OR_ROLE_MISMATCH");
    configure("require");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","workbench/sigapro-consolidacao-p3-no-deploy-20261029");
    expect(()=>prodDatabaseUrl()).toThrow("PROD_BRANCH_REQUIRED");
  });
});
