import { createHmac } from "node:crypto";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const db=vi.hoisted(()=>({
 ready:vi.fn(), withConnection:vi.fn(), readSecrets:vi.fn(), fetchOrder:vi.fn(), persist:vi.fn()
}));
vi.mock("../../server/mp-webhook-tenant.js",()=>({
 qaWebhookConfigured:db.ready,
 withWebhookConnection:db.withConnection,
 readQaMunicipalPaymentSecret:db.readSecrets,
 fetchMunicipalMpOrder:db.fetchOrder,
 persistQaOrderEvent:db.persist
}));
import handler from "../../api/mercadopago-webhook";
import { verifyMercadoPagoOrderWebhook } from "../../server/mp-webhook-signature";

const id="ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
const municipality="49dac0b6-6352-4744-9aab-9ff91c59d970";
const foreign="c334d39c-3a77-464c-abd6-a3a539cceba1";
const requestId="2066ca19-c6f1-498a-be75-1923005edd06";
const secret="test-qa-tenant-only-signature-secret";
const notice={id:"995121",type:"order",action:"order.updated",live_mode:false,data:{id}};
function signed(t=String(Date.now()),key=secret,oid=id){
 return "ts="+t+",v1="+createHmac("sha256",key).update(`id:${oid.toLowerCase()};request-id:${requestId};ts:${t};`).digest("hex");
}
function validate(input: Partial<Parameters<typeof verifyMercadoPagoOrderWebhook>[0]>={}){
 const now=Date.now();
 return verifyMercadoPagoOrderWebhook({rawQueryId:id,queryTopic:"order",headerSignature:signed(String(now)),
   requestId,notification:notice,secret,nowMs:now,...input});
}
async function request(method:string, opts:{
  tenant?:string;queryId?:string;action?:string;
  body?:Record<string,unknown>;signature?:string;requestId?:string;
}={}){
 let body:Record<string,unknown>={};
 const req={
  method,
  url:`/api/mercadopago-webhook?municipality_id=${opts.tenant||municipality}&type=order&data.id=${opts.queryId||id}`,
  body:opts.body||notice,
  headers:{"x-signature":opts.signature||signed(),"x-request-id":opts.requestId??requestId}
 };
 const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((raw:string)=>{body=JSON.parse(raw)})};
 await handler(req as never,res as never);
 return {status:res.statusCode,body};
}
beforeEach(()=>{
 vi.resetAllMocks();
 db.ready.mockReturnValue(true);
 db.withConnection.mockImplementation((cb:(conn:object)=>Promise<unknown>)=>cb({}));
 db.readSecrets.mockResolvedValue({webhookSecret:secret,accessToken:"encrypted-token-decrypted-in-backend"});
 db.fetchOrder.mockResolvedValue({fetched:true,status:"processed",reference:"QA-GUIDE",currency:"BRL",amount:12.30});
 db.persist.mockResolvedValue({receipt_id:"11111111-1111-4111-8111-111111111111",status:"verified_manual_review",matched:true,attempts:1});
});
afterEach(()=>vi.unstubAllEnvs());
describe("Mercado Pago multi-tenant TEST webhook durable inbox",()=>{
 it("valid HMAC signs uppercase order ID using lowercase canonical representation",()=>expect(validate()).toMatchObject({ok:true,orderId:id}));
 it("rejects forged HMAC",()=>expect(validate({headerSignature:signed(undefined,"forged-secret")}).ok).toBe(false));
 it("rejects mismatched URL and event order identifiers",()=>expect(validate({notification:{...notice,data:{id:"OTHER1234"}}}).ok).toBe(false));
 it("rejects production events",()=>expect(validate({notification:{...notice,live_mode:true}}).ok).toBe(false));
 it("rejects wrong topic",()=>expect(validate({queryTopic:"payment"}).ok).toBe(false));
 it("rejects missing request ID",()=>expect(validate({requestId:""}).ok).toBe(false));
 it("rejects duplicate signature fields",()=>expect(validate({headerSignature:signed()+",v1="+"0".repeat(64)}).ok).toBe(false));
 it("rejects stale timestamp",()=>{
  const before=Date.now()-6*60*1000;
  expect(validate({headerSignature:signed(String(before))}).ok).toBe(false);
 });
 it("health states manual reconciliation without exposing secrets",async()=>{
  const r=await request("GET");
  expect(r.status).toBe(200);
  expect(r.body.durableReceiptConfigured).toBe(true);
  expect(r.body.reconciliationMode).toBe("manual_review_no_automatic_settlement");
  expect(JSON.stringify(r.body)).not.toContain(secret);
 });
 it("stays closed if isolated database is not ready",async()=>{
  db.ready.mockReturnValue(false);
  const r=await request("POST");
  expect(r.status).toBe(503);
  expect(db.withConnection).not.toHaveBeenCalled();
 });
 it("requires registered municipality ID",async()=>{
  const r=await request("POST",{tenant:"production"});
  expect(r.status).toBe(400);
  expect(db.withConnection).not.toHaveBeenCalled();
 });
 it("requires a webhook secret for the SPECIFIC municipality",async()=>{
  db.readSecrets.mockResolvedValue(null);
  const r=await request("POST");
  expect(r.status).toBe(503);
  expect(db.fetchOrder).not.toHaveBeenCalled();
  expect(db.persist).not.toHaveBeenCalled();
 });
 it("forged notification never reaches provider or event inbox",async()=>{
  const r=await request("POST",{body:{...notice,data:{id:"OTHER1234"}}});
  expect(r.status).toBe(401);
  expect(db.fetchOrder).not.toHaveBeenCalled();
  expect(db.persist).not.toHaveBeenCalled();
 });
 it("writes bank-verified observation to tenant journal but NEVER pays a guide",async()=>{
  const r=await request("POST");
  expect(r.status).toBe(200);
  expect(r.body.automaticSettlement).toBe(false);
  expect(r.body.reconciliationStatus).toBe("verified_manual_review");
  expect(db.readSecrets).toHaveBeenCalledWith({},municipality);
  expect(db.fetchOrder).toHaveBeenCalledWith(id,"encrypted-token-decrypted-in-backend");
  expect(db.persist).toHaveBeenCalledOnce();
  expect(db.persist.mock.calls[0][1]).toMatchObject({
   municipalityId:municipality,orderId:id,requestId,
   observation:{fetched:true,reference:"QA-GUIDE",amount:12.30}
  });
 });
 it("isolates another municipality's HMAC key from the original municipality",async()=>{
  db.readSecrets.mockImplementation(async(_db:unknown,tenant:string)=>tenant===municipality?{webhookSecret:secret,accessToken:"qa"}:{webhookSecret:"different-tenant-secret",accessToken:"foreign"});
  const r=await request("POST",{tenant:foreign});
  expect(r.status).toBe(401);
  expect(db.fetchOrder).not.toHaveBeenCalled();
  expect(db.persist).not.toHaveBeenCalled();
 });
 it("persists a failed bank lookup then demands Mercado Pago retry",async()=>{
  db.fetchOrder.mockRejectedValue(new Error("provider unavailable"));
  const r=await request("POST");
  expect(r.status).toBe(503);
  expect(r.body.code).toBe("QA_BANK_RETRY_REQUIRED");
  expect(r.body.receiptSaved).toBe(true);
  expect(db.persist.mock.calls[0][1].observation.fetched).toBe(false);
 });
 it("returns 503 if database insert fails; never acknowledges dropped events",async()=>{
  db.persist.mockRejectedValue(new Error("pg unavailable"));
  const r=await request("POST");
  expect(r.status).toBe(503);
  expect(r.body.code).toBe("QA_WEBHOOK_PROCESSING_UNAVAILABLE");
 });
 it("acknowledges an unmatched bank order only after journaling",async()=>{
  db.persist.mockResolvedValue({receipt_id:"12",status:"unmatched_manual_review",matched:false,attempts:1});
  const r=await request("POST");
  expect(r.status).toBe(200);
  expect(r.body.reconciliationStatus).toBe("unmatched_manual_review");
  expect(r.body.automaticSettlement).toBe(false);
 });
 it("deduplicated webhook is still idempotent and not a financial confirmation",async()=>{
  db.persist.mockResolvedValue({receipt_id:"12",status:"verified_manual_review",matched:true,attempts:2});
  const r=await request("POST");
  expect(r.status).toBe(200);
  expect(r.body.automaticSettlement).toBe(false);
 });
});
