import { createHmac } from "node:crypto";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import handler from "../../api/mercadopago-webhook";
import { verifyMercadoPagoOrderWebhook } from "../../server/mp-webhook-signature";

const now=Date.now();
const id="ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
const requestId="2066ca19-c6f1-498a-be75-1923005edd06";
const ts=String(now);
const secret="test-secret-for-qa-signature-only";
const notice={type:"order", action:"order.updated",live_mode:false,data:{id}};
function signature(orderId=id.toLowerCase(),s=secret,t=ts){
  return "ts="+t+",v1="+createHmac("sha256",s).update(`id:${orderId};request-id:${requestId};ts:${t};`).digest("hex");
}
function validate(input: Partial<Parameters<typeof verifyMercadoPagoOrderWebhook>[0]>={}){
  return verifyMercadoPagoOrderWebhook({rawQueryId:id,queryTopic:"order",
    headerSignature:signature(),requestId,notification:notice,secret,nowMs:now,...input});
}
beforeEach(()=>{
  vi.stubEnv("VERCEL_ENV","preview");
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","true");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF","qa/sigapro-ia-logo-integrado-20261023");
  vi.stubEnv("SIGAPRO_QA_MP_WEBHOOK_SECRET",secret);
});
afterEach(()=>vi.unstubAllEnvs());
async function request(method:string, data:Record<string,unknown>=notice as Record<string,unknown>){
  let body:Record<string,unknown>={};
  const req={method,url:`/api/mercadopago-webhook?type=order&data.id=${id}`,body:data,
    headers:{"x-signature":signature(),"x-request-id":requestId}} as never;
  const res={statusCode:200,setHeader:vi.fn(),
    end:vi.fn((raw:string)=>{body=JSON.parse(raw);})} as never;
  await handler(req,res);
  return {status:(res as {statusCode:number}).statusCode,body};
}
describe("Mercado Pago TEST webhook HMAC and settlement firewall",()=>{
 it("verifies authentic signed uppercase order IDs per MP documentation",()=>expect(validate()).toMatchObject({ok:true,orderId:id}));
 it("rejects fake HMAC",()=>expect(validate({headerSignature:signature(id.toLowerCase(),"wrong-secret")}).ok).toBe(false));
 it("rejects stale notifications",()=>expect(validate({nowMs:now+6*60*1000}).ok).toBe(false));
 it("rejects different query and body IDs",()=>expect(validate({notification:{...notice,data:{id:"ORD01DIFFERENT"}}}).ok).toBe(false));
 it("rejects production live_mode events",()=>expect(validate({notification:{...notice,live_mode:true}}).ok).toBe(false));
 it("rejects wrong event topic",()=>expect(validate({queryTopic:"payment"}).ok).toBe(false));
 it("rejects missing request id",()=>expect(validate({requestId:""}).ok).toBe(false));
 it("rejects duplicate signature fields",()=>expect(validate({headerSignature:signature()+",v1="+"0".repeat(64)}).ok).toBe(false));
 it("rejects altered request timestamp",()=>expect(validate({headerSignature:signature(id.toLowerCase(),secret,String(now-1000))}).ok).toBe(false));
 it("exposes no credential in health",async()=>{const r=await request("GET");expect(r.body.secretConfigured).toBe(true);expect(JSON.stringify(r.body)).not.toContain(secret);});
 it("refuses receipt without durable persistence even with valid HMAC",async()=>{const r=await request("POST");expect(r.status).toBe(503);expect(r.body.code).toBe("WEBHOOK_PERSISTENCE_NOT_READY");});
 it("rejects forged webhook at HTTP boundary",async()=>{const r=await request("POST",{...notice,data:{id:"OTHER"}});expect(r.status).toBe(401);});
 it("stays closed on production or non QA branches",async()=>{vi.stubEnv("VERCEL_ENV","production");const r=await request("POST");expect(r.status).toBe(503);expect(r.body.code).toBe("ISOLATED_QA_ONLY");});
 it("rejects missing webhook secret",async()=>{vi.stubEnv("SIGAPRO_QA_MP_WEBHOOK_SECRET","");const r=await request("POST");expect(r.status).toBe(503);expect(r.body.code).toBe("WEBHOOK_SECRET_NOT_CONFIGURED");});
});
