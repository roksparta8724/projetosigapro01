/** Revalidate a previously signed QA bank order after its PDF archive.
 * No new order, payment or unsigned webhook is generated. */
import type {IncomingMessage,ServerResponse} from "node:http";
import {readStoredGuide} from "./guide-persistence.js";
import {isPersistedGuideSettled} from "./guide-settlement.js";
import {callDataApiRpc,readBearer} from "./municipal-storage.js";
import {qaWebhookConfigured,withWebhookConnection,readQaMunicipalPaymentSecret,
 fetchMunicipalMpOrder,persistQaOrderEvent} from "./mp-webhook-tenant.js";
type Req=IncomingMessage&{body?:unknown};
type Res=ServerResponse;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function send(res:Res,status:number,data:Record<string,unknown>){
 res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(data));
}
async function bodyOf(req:Req):Promise<Record<string,unknown>>{
 if(req.body!==undefined){
  if(!req.body||typeof req.body!=="object"||Array.isArray(req.body)||
    JSON.stringify(req.body).length>4096)throw new Error("INVALID_BODY");
  return req.body as Record<string,unknown>;
 }
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of req){
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk as Uint8Array);
  size+=bytes.length;if(size>4096)throw new Error("TOO_LARGE");chunks.push(bytes);
 }
 const data=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}") as unknown;
 if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("INVALID_BODY");
 return data as Record<string,unknown>;
}
export default async function handler(req:Req,res:Res){
 if(req.method!=="POST")return send(res,405,{ok:false,code:"METHOD_NOT_ALLOWED"});
 if(!qaWebhookConfigured())return send(res,404,{ok:false,code:"QA_ONLY"});
 if(!readBearer(req))return send(res,401,{ok:false,code:"AUTH_REQUIRED"});
 let body:Record<string,unknown>;
 try{body=await bodyOf(req)}catch{return send(res,400,{ok:false,code:"INVALID_BODY"})}
 const municipalityId=String(body.municipalityId||"");
 const guideCode=String(body.guideCode||"");
 if(!uuid.test(municipalityId)||!/^DAM-PRE-[A-Za-z0-9-]{8,100}$/.test(guideCode))
  return send(res,400,{ok:false,code:"INVALID_QA_GUIDE"});
 try{
  const guide=await readStoredGuide(req,municipalityId,guideCode);
  if(guide.municipality_id!==municipalityId||guide.guide_number!==guideCode||
    !guide.process_id||!guide.bank_reference||!guide.bank_payment_id||
    guide.provider_environment!=="test"||guide.payment_provider!=="mercado_pago"||
    guide.collection_mode_snapshot!=="sigapro")
    return send(res,403,{ok:false,code:"QA_GUIDE_NOT_ELIGIBLE"});
  if(isPersistedGuideSettled(guide))
    return send(res,200,{ok:true,status:"already_settled_qa",settled:true});
  if(!guide.original_pdf_key||!guide.original_pdf_sha256||!guide.document_snapshot)
    return send(res,409,{ok:false,code:"QA_ORIGINAL_PDF_REQUIRED"});
  // Unlike new charge authorization, this remains valid AFTER PDF freeze.
  const access=await callDataApiRpc<boolean>(req,"qa_authorize_guide_reconciliation_v1",{
   _municipality_id:municipalityId,_guide_code:guideCode,_bank_reference:guide.bank_reference,
  });
  if(!access.ok||access.payload!==true)
    return send(res,403,{ok:false,code:"QA_RECONCILIATION_FORBIDDEN"});
  return await withWebhookConnection(async db=>{
   const secret=await readQaMunicipalPaymentSecret(db,municipalityId);
   if(!secret)return send(res,503,{ok:false,code:"QA_PROVIDER_NOT_READY"});
   let observation;
   try{observation=await fetchMunicipalMpOrder(guide.bank_reference!,secret.accessToken)}
   catch{return send(res,503,{ok:false,code:"QA_PROVIDER_UNAVAILABLE"})}
   if(!observation.fetched)
    return send(res,503,{ok:false,code:"QA_PROVIDER_UNAVAILABLE"});
   if(!observation.accredited)
    return send(res,200,{ok:true,status:"awaiting_bank_credit",settled:false});
   // A fresh bank GET cannot create a forged signed receipt.
   const signed=await db.query(
    "SELECT public.mp_qa_webhook_signed_receipt_v1($1::uuid,$2::text) AS receipt",
    [municipalityId,guide.bank_reference!]);
   const proof=signed.rows[0]?.receipt as Record<string,unknown>|null|undefined;
   if(!proof||typeof proof.request_id!=="string"||
     typeof proof.notification_id!=="string"||
     typeof proof.payload_sha256!=="string")
    return send(res,409,{ok:false,code:"QA_SIGNED_WEBHOOK_REQUIRED"});
   const result=await persistQaOrderEvent(db,{
    municipalityId,orderId:guide.bank_reference!,
    requestId:proof.request_id,notificationId:proof.notification_id,
    payloadHash:proof.payload_sha256,observation,
   });
   const settled=result.status==="settled_qa"||result.status==="already_settled_qa";
   return send(res,200,{ok:true,status:result.status,settled});
  });
 }catch{
  return send(res,503,{ok:false,code:"QA_RECONCILIATION_UNAVAILABLE"});
 }
}
