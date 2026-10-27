import { createHash } from "node:crypto";
import type { IncomingMessage,ServerResponse } from "node:http";
import { verifyMercadoPagoOrderWebhook,type MPOrderNotice } from "../server/mp-webhook-signature.js";
import { withWebhookConnection,readQaMunicipalPaymentSecret,fetchMunicipalMpOrder,persistQaOrderEvent,qaWebhookConfigured } from "../server/mp-webhook-tenant.js";

type Req=IncomingMessage & {body?:unknown};
type Res=ServerResponse;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function send(res:Res,status:number,body:Record<string,unknown>){
 res.statusCode=status;
 res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("Cache-Control","no-store");
 res.end(JSON.stringify(body));
}
async function readNotice(req:Req):Promise<MPOrderNotice & {id?:unknown}>{
 if(req.body&&typeof req.body==="object"){
  if(JSON.stringify(req.body).length>32768) throw new Error("WEBHOOK_TOO_LARGE");
  return req.body as MPOrderNotice;
 }
 const chunks:Buffer[]=[];let size=0;
 for await(const v of req){
  const b=Buffer.isBuffer(v)?v:Buffer.from(v as Uint8Array);
  size+=b.length;if(size>32768)throw new Error("WEBHOOK_TOO_LARGE");chunks.push(b);
 }
 return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export default async function handler(req:Req,res:Res){
 if(req.method==="GET")return send(res,200,{
  ok:true,environment:"qa",
  receiverDeployed:process.env.VERCEL_ENV==="preview" &&
   process.env.VERCEL_GIT_COMMIT_REF==="qa/sigapro-ia-logo-integrado-20261023",
  durableReceiptConfigured:qaWebhookConfigured(),
  reconciliationMode:"manual_review_no_automatic_settlement",
 });
 if(req.method!=="POST")return send(res,405,{ok:false,code:"METHOD_NOT_ALLOWED"});
 if(!qaWebhookConfigured())return send(res,503,{ok:false,code:"QA_WEBHOOK_DATABASE_NOT_READY"});
 let url:URL;try{url=new URL(req.url||"/","https://qa.invalid")}catch{return send(res,400,{ok:false,code:"INVALID_QUERY"})}
 const municipalityId=url.searchParams.get("municipality_id")||"";
 const orderId=url.searchParams.get("data.id");
 const topic=url.searchParams.get("type");
 if(!uuid.test(municipalityId))return send(res,400,{ok:false,code:"QA_MUNICIPALITY_ID_REQUIRED"});
 let notice:MPOrderNotice&{id?:unknown};
 try{notice=await readNotice(req)}catch{return send(res,400,{ok:false,code:"INVALID_EVENT_BODY"})}
 const requestId=String(req.headers["x-request-id"]||"");
 const signature=String(req.headers["x-signature"]||"");
 // Do not expose secret, account token, full payment data, or SQL exceptions.
 try{
  const outcome=await withWebhookConnection(async db=>{
   const config=await readQaMunicipalPaymentSecret(db,municipalityId);
   if(!config)return {kind:"unconfigured"} as const;
   const verified=verifyMercadoPagoOrderWebhook({
    rawQueryId:orderId,queryTopic:topic,notification:notice,
    headerSignature:signature,requestId,secret:config.webhookSecret,
   });
   if(!verified.ok)return {kind:"invalid"} as const;
   let observation;
   try{observation=await fetchMunicipalMpOrder(verified.orderId,config.accessToken)}
   catch{observation={fetched:false,status:"provider_unavailable",reference:"",currency:"",amount:null}}
   const notificationId=String(notice.id||requestId).slice(0,128);
   const payloadHash=createHash("sha256").update(JSON.stringify(notice)).digest("hex");
   const receipt=await persistQaOrderEvent(db,{
    municipalityId,orderId:verified.orderId,requestId,notificationId,
    payloadHash,observation
   });
   return {kind:"saved",receipt,retry:!observation.fetched} as const;
  });
  if(outcome.kind==="unconfigured")return send(res,503,{ok:false,code:"QA_MUNICIPAL_WEBHOOK_SECRET_REQUIRED"});
  if(outcome.kind==="invalid")return send(res,401,{ok:false,code:"INVALID_WEBHOOK_SIGNATURE"});
  if(outcome.retry)return send(res,503,{ok:false,code:"QA_BANK_RETRY_REQUIRED",receiptSaved:true});
  return send(res,200,{ok:true,received:true,receiptId:outcome.receipt.receipt_id,
   reconciliationStatus:outcome.receipt.status,automaticSettlement:false});
 }catch{
  return send(res,503,{ok:false,code:"QA_WEBHOOK_PROCESSING_UNAVAILABLE"});
 }
}
