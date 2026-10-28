/**
 * QA-only Mercado Pago PIX: persisted tenant+guide reservation in Neon.
 * Disabled unless a dedicated test-orders opt-in is present. Never settles guides.
 */
import { createHash } from "node:crypto";
import type { IncomingMessage,ServerResponse } from "node:http";
import { readStoredGuide } from "../server/guide-persistence.js";
import { isPersistedGuideSettled } from "../server/guide-settlement.js";
import { resolveMercadoPagoMunicipalAccessToken } from "../server/municipal-payment.js";
import { callDataApiRpc } from "../server/municipal-storage.js";
import { isValidPixPayload } from "../src/lib/pix.js";
import { signQaPixProof } from "../server/qa-mp-pix-proof.js";

type Req=IncomingMessage & {body?:Record<string,unknown>};
type Res=ServerResponse;
type Reservation={municipality_id:string;guide_number:string;guide_id:string;amount:number;
 idempotency_key:string;order_id?:string|null;payment_id?:string|null;qr_code?:string|null;
 provider_status?:string|null;state:"pending"|"issued";may_post?:boolean;created_at?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function send(res:Res,status:number,data:unknown){
 res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(data));
}
function onlyQa(){
 return process.env.VERCEL_ENV==="preview" &&
  process.env.VERCEL_GIT_COMMIT_REF==="qa/sigapro-ia-logo-integrado-20261023" &&
  process.env.VITE_SIGAPRO_NEON_ISOLATED==="true" &&
  process.env.SIGAPRO_QA_MP_SETUP_OPT_IN==="QA_ONLY_TEST_CREDENTIALS";
}
function enabled(){
 return onlyQa() && process.env.SIGAPRO_QA_MP_CHARGE_OPT_IN==="QA_ONLY_TEST_ORDERS";
}
async function readBody(req:Req):Promise<Record<string,unknown>>{
 if(req.body && typeof req.body==="object")return req.body;
 let raw="";
 for await(const chunk of req){
  raw+=Buffer.from(chunk).toString("utf8");
  if(raw.length>10000)throw new Error("Requisição excede o limite permitido");
 }
 const body=JSON.parse(raw||"{}");
 if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Corpo inválido");
 return body;
}
function keyFor(tenant:string,guideId:string){
 const h=createHash("sha256").update(["sigapro","qa","pix","v1",tenant,guideId].join("|")).digest("hex");
 return [h.slice(0,8),h.slice(8,12),"4"+h.slice(13,16),"8"+h.slice(17,20),h.slice(20,32)].join("-");
}
function render(r:Reservation){
 const qr=String(r.qr_code||"");
 return {ok:Boolean(qr&&isValidPixPayload(qr)),sandboxOnly:true,environment:"test" as const,
  orderId:r.order_id||undefined,paymentId:r.payment_id||undefined,
  qrCode:qr&&isValidPixPayload(qr)?qr:undefined,status:r.provider_status||"pending",
  ...(!qr?{error:"Emissão PIX pendente. A mesma order deve ser consultada, sem nova cobrança."}:{})};
}
async function rpc<T>(req:Req,name:string,input:Record<string,unknown>):Promise<T>{
 const r=await callDataApiRpc<T>(req,name,input);
 if(!r.ok||!r.payload)throw new Error(r.error||"Persistência Neon não confirmada");
 return r.payload;
}
export default async function handler(req:Req,res:Res){
 if(!onlyQa())return send(res,404,{ok:false,code:"QA_PIX_UNAVAILABLE"});
 if(req.method!=="POST")return send(res,405,{ok:false,code:"METHOD_NOT_ALLOWED"});
 if(!/^Bearer\s+\S+$/i.test(String(req.headers.authorization||"")))
  return send(res,401,{ok:false,code:"AUTH_REQUIRED"});
 try{
  const body=await readBody(req);
  const municipalityId=String(body.municipalityId||"");
  const guideCode=String(body.guideCode||"");
  const action=String(body.action||"");
  if(!uuid.test(municipalityId)||!/^DAM-PRE-[A-Za-z0-9-]{8,100}$/.test(guideCode)||
    !["issue","get"].includes(action))
   return send(res,400,{ok:false,code:"INVALID_QA_REQUEST"});
  const guide=await readStoredGuide(req,municipalityId,guideCode);
  if(guide.municipality_id!==municipalityId||guide.guide_number!==guideCode||
    isPersistedGuideSettled(guide)||guide.collection_mode_snapshot==="municipal_system")
   return send(res,403,{ok:false,code:"GUIDE_INELIGIBLE"});
  if(action==="issue"&&!enabled())
   return send(res,503,{ok:false,code:"QA_PIX_CHARGE_OPT_IN_REQUIRED",
     error:"A emissão PIX exige habilitação exclusiva de cobranças de teste no Vercel."});
  const key=keyFor(municipalityId,guide.id);
  // Reading is side-effect free: it must not reserve a pending PIX order.
  let reservation:Reservation;
  if(action==="get"){
   const existing=await callDataApiRpc<Reservation|null>(req,
     guide.original_pdf_key || guide.document_snapshot
       ? "qa_mp_pix_read_existing_v1"
       : "qa_mp_pix_get_v1",{
    _municipality_id:municipalityId,_guide_code:guideCode
   });
   if(!existing.ok)throw new Error("PIX de teste não pôde ser consultado");
   if(!existing.payload)return send(res,200,{ok:false,sandboxOnly:true,
    error:"PIX de teste ainda não emitido."});
   reservation=existing.payload;
  }else{
   // Reserving the unique guide+tenant is a database transaction, not a Vercel filesystem.
   reservation=await rpc<Reservation>(req,"qa_mp_pix_reserve_v2",{
    _municipality_id:municipalityId,_guide_code:guideCode,_key:key,
    ...signQaPixProof({action:"reserve",municipalityId,guideCode,key,amount:Number(guide.amount)})
   });
  }
  if(reservation.municipality_id!==municipalityId||reservation.guide_id!==guide.id ||
    Number(reservation.amount)!==Number(guide.amount)||reservation.idempotency_key!==key)
   throw new Error("Reserva PIX não corresponde à guia original");
  // GET refreshes the already-existing order, without any new charge.
  if(reservation.state==="issued"&&action==="issue")return send(res,200,render(reservation));
  // A prior attempt without a saved order may be reconciled read-only by external_reference.
  const resolved=await resolveMercadoPagoMunicipalAccessToken(req,municipalityId);
  if(resolved.environment!=="test"||!resolved.token)
   return send(res,403,{ok:false,code:"TEST_CREDENTIALS_ONLY"});
  const amount=Number(guide.amount).toFixed(2);
  const externalReference=guide.guide_number;
  const hasOrder=Boolean(reservation.order_id);
  const baseUrl="https://api.mercadopago.com/v1/orders";
  const commonHeaders={Accept:"application/json",Authorization:"Bearer "+resolved.token};
  const recoverOnly=!hasOrder && (action==="get"||reservation.may_post!==true);
  let provider:Awaited<ReturnType<typeof fetch>>;
  let recoveredOrderId:string|null=null;
  if(recoverOnly){
   // Read-only reconciliation. A rejected/uncertain POST is NEVER repeated automatically.
   // Search exact guide reference, bounded by creation date, as in the official Orders API.
   const created=Date.parse(String(reservation.created_at||""));
   const begin=new Date((Number.isFinite(created)?created:Date.now())-24*60*60*1000);
   const end=new Date(Date.now()+60*60*1000);
   const search=new URL(baseUrl);
   search.searchParams.set("begin_date",begin.toISOString());
   search.searchParams.set("end_date",end.toISOString());
   search.searchParams.set("external_reference",externalReference);
   const lookup=await fetch(search.toString(),{
    method:"GET",headers:commonHeaders,signal:AbortSignal.timeout(15000),
   });
   const body=await lookup.json().catch(()=>null);
   if(!lookup.ok||!body||typeof body!=="object"||!Array.isArray((body as {data?:unknown}).data)){
    console.warn("[sigapro-qa-pix] search_failed",{status:lookup.status});
    return send(res,503,{ok:false,code:"QA_PIX_RECONCILIATION_UNAVAILABLE",
     error:"A consulta segura da tentativa PIX no provedor não foi concluída. Nenhuma nova cobrança será enviada."});
   }
   const results=(body as {data:Array<Record<string,unknown>>}).data
    .filter(x=>x&&x.external_reference===externalReference);
   const paging=(body as {paging?:{total?:number}}).paging;
   if(results.length>1||(paging?.total!==undefined&&Number(paging.total)>results.length))
    return send(res,409,{ok:false,code:"QA_PIX_AMBIGUOUS_ORDER",
     error:"O provedor encontrou múltiplas ordens ou resultados incompletos. Emissão bloqueada para conferência."});
   if(results.length===0)
    return send(res,409,{ok:false,code:"QA_PIX_NO_ORDER_FOUND",
     error:"O provedor não localizou uma ordem desta tentativa. A guia permanece bloqueada para impedir duplicidade; use outra guia de TESTE após conferência."});
   const recoveredId=String(results[0].id||"");
   if(!/^[A-Za-z0-9_-]{6,100}$/.test(recoveredId))
    return send(res,409,{ok:false,code:"QA_PIX_BAD_SEARCH_RESULT",
     error:"A busca retornou uma ordem sem identificador válido; não criar outra cobrança."});
   recoveredOrderId=recoveredId;
   provider=await fetch(baseUrl+"/"+encodeURIComponent(recoveredId),{
    method:"GET",headers:commonHeaders,signal:AbortSignal.timeout(15000),
   });
  }else if(hasOrder){
   provider=await fetch(baseUrl+"/"+encodeURIComponent(reservation.order_id||""),{
    method:"GET",headers:commonHeaders,signal:AbortSignal.timeout(15000),
   });
  }else{
   if(!enabled())return send(res,503,{ok:false,code:"QA_PIX_CHARGE_OPT_IN_REQUIRED"});
   // The official Checkout Transparente Orders API REQUIRES this header even in
   // automatic processing mode. It is stable per tenant+guide, never random per click.
   provider=await fetch(baseUrl,{
    method:"POST",signal:AbortSignal.timeout(15000),
    headers:{...commonHeaders,"Content-Type":"application/json","X-Idempotency-Key":key},
    body:JSON.stringify({
     type:"online",processing_mode:"automatic",external_reference:externalReference,
     total_amount:amount,payer:{email:"test_payer@example.com",first_name:"APRO"},
     transactions:{payments:[{amount,payment_method:{id:"pix",type:"bank_transfer"}}]}
    }),
   });
  }
  const order=await provider.json().catch(()=>null);
  if(!provider.ok||!order||typeof order!=="object"){
   const errorBody=order&&typeof order==="object"?order as Record<string,unknown>:{};
   const errors=Array.isArray(errorBody.errors)?errorBody.errors:[];
   const first=errors[0]&&typeof errors[0]==="object"?errors[0] as Record<string,unknown>:{};
   const codeRaw=String(first.code||errorBody.code||errorBody.error||"unknown");
   const providerCode=/^[A-Za-z0-9_.-]{1,64}$/.test(codeRaw)?codeRaw:"unavailable";
   // Never log provider body, secret, municipal key, QR payload or payment personal data.
   console.warn("[sigapro-qa-pix] provider_declined",{status:provider.status,code:providerCode});
   if(action==="get"&&reservation.state==="issued"&&reservation.order_id)
    return send(res,200,{...render(reservation),statusStale:true});
   return send(res,503,{ok:false,code:"QA_PIX_PROVIDER_UNAVAILABLE",providerCode,
    error:"Mercado Pago não confirmou a ordem (HTTP "+provider.status+", "+providerCode+"). A tentativa permanece protegida contra duplicidade."});
  }
  const object=order as Record<string,unknown>;
  const orderId=String(object.id||"");
  const providerAmount=String(object.total_amount||"");
  const transactions=object.transactions as {payments?:Array<Record<string,unknown>>}|undefined;
  const payment=transactions?.payments?.[0]||{};
  const method=(payment.payment_method||{}) as Record<string,unknown>;
  const qr=String(method.qr_code||"");
  if(!/^[A-Za-z0-9_-]{6,100}$/.test(orderId) ||
    (hasOrder&&orderId!==reservation.order_id) ||
    (recoveredOrderId!==null&&orderId!==recoveredOrderId) ||
    object.external_reference!==externalReference ||
    !/^\d+(?:\.\d{1,2})?$/.test(providerAmount) ||
    Math.round(Number(providerAmount)*100)!==Math.round(Number(amount)*100) ||
    (transactions?.payments?.length && (method.id!=="pix"||method.type!=="bank_transfer")) ||
    (qr&&!isValidPixPayload(qr)))
   return send(res,409,{ok:false,code:"QA_PIX_PROVIDER_MISMATCH",
    error:"Order, valor ou QR não correspondem à guia. Não gerar outra cobrança."});
  const providerPaymentId=String(payment.id||"");
  const providerStatus=String(object.status||payment.status||"action_required");
  const saved=await rpc<Reservation>(req,"qa_mp_pix_save_v2",{
   _municipality_id:municipalityId,_guide_code:guideCode,_key:key,
   _order_id:orderId,_payment_id:providerPaymentId,
   _status:providerStatus,
   _qr_code:qr,_amount:Number(amount),
   ...signQaPixProof({action:"save",municipalityId,guideCode,key,
     amount:Number(amount),orderId,paymentId:providerPaymentId,status:providerStatus,qrCode:qr})
  });
  if(saved.order_id!==orderId||saved.municipality_id!==municipalityId)
   throw new Error("Gravação PIX não foi confirmada");
  return send(res,200,render(saved));
 }catch(error){
  // Do not expose tenant identity, token, secret, raw provider payload or database exceptions.
  console.warn("[sigapro-qa-pix] request_not_completed");
  return send(res,503,{ok:false,code:"QA_PIX_NOT_COMPLETED",
   error:"PIX de homologação não concluído. Reabra a mesma guia para consultar, sem gerar cobrança paralela."});
 }
}