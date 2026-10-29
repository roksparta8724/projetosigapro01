import {createHmac} from "node:crypto";
import {describe,expect,it} from "vitest";
import {verifyMercadoPagoOrderWebhook} from "../../server/mp-webhook-signature";

const secret="test-only-not-a-secret-0123456789";
const id="ORDTST01M5J2CCQNPATDJHT6CCZJ9BKS";
const requestId="7e6b4d36-19c8-4887-9141-7d901a7bcd12";
const now=1793149000000;
const ts=String(Math.floor(now/1000));
const notice={type:"order",action:"order.processed",live_mode:false,data:{id}};
function makeHeader(idInManifest:string){
 const message=`id:${idInManifest};request-id:${requestId};ts:${ts};`;
 const mac=createHmac("sha256",secret).update(message,"utf8").digest("hex");
 return `ts=${ts},v1=${mac}`;
}
function verify(signature:string,bodyId=id,queryId=id){
 return verifyMercadoPagoOrderWebhook({
  rawQueryId:queryId,queryTopic:"order",notification:{...notice,data:{id:bodyId}},
  headerSignature:signature,requestId,secret,nowMs:now,
 });
}
describe("Mercado Pago webhook order ID HMAC manifest",()=>{
 it("accepts the officially documented lowercased signature for uppercase Order IDs",()=>{
  const result=verify(makeHeader(id.toLowerCase()));
  expect(result).toEqual({ok:true,orderId:id});
 });
 it("keeps the original identifier for notification and provider lookup",()=>{
  expect(verify(makeHeader(id.toLowerCase()),id.toLowerCase())).toMatchObject({ok:false});
 });
 it("does not silently accept a signature calculated over the wrong case",()=>{
  expect(verify(makeHeader(id))).toMatchObject({ok:false,reason:"Assinatura não confere."});
 });
 it("rejects modified body order IDs, even with a valid signature",()=>{
  expect(verify(makeHeader(id.toLowerCase()),"ORD_DIFFERENT")).toMatchObject({ok:false});
 });
 it("rejects valid HMAC outside timestamp tolerance",()=>{
  const x=verifyMercadoPagoOrderWebhook({rawQueryId:id,queryTopic:"order",notification:notice,
   headerSignature:makeHeader(id.toLowerCase()),requestId,secret,nowMs:now+7*60*1000});
  expect(x).toMatchObject({ok:false,reason:"Notificação vencida ou com horário inválido."});
 });
});
