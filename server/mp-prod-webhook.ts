/** Production-only Mercado Pago Orders webhook settlement.
 * Safe default: unavailable unless deployed from main with a pinned Neon PROD
 * worker URL; credentials belong to each municipality. Never use QA secrets. */
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import type {IncomingMessage,ServerResponse} from "node:http";
import {verifyMercadoPagoOrderWebhook,type MPOrderNotice} from "./mp-webhook-signature.js";
import {fetchMunicipalMpOrder} from "./mp-prod-provider-order.js";
import {decryptPaymentAccessToken,decryptPaymentWebhookSecret} from "./municipal-payment.js";
import {readStoredGuide} from "./guide-persistence.js";
import {readBearer} from "./municipal-storage.js";

type Req=IncomingMessage & {body?:unknown};
type Res=ServerResponse;
type Db={connect():Promise<void>;end():Promise<void>;
 query(sql:string,args:unknown[]):Promise<{rows:Array<Record<string,unknown>>}>};
const requiredBranch="main";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const providerId=/^[A-Za-z0-9_-]{6,100}$/;
const requireNode=createRequire(import.meta.url);
function prodEnv(){
 return process.env.VERCEL_ENV==="production" &&
   process.env.VERCEL_GIT_COMMIT_REF===requiredBranch;
}
function prodDatabaseUrl(){
 if(!prodEnv())throw new Error("PROD_BRANCH_REQUIRED");
 const raw=String(process.env.SIGAPRO_PROD_MP_WEBHOOK_DATABASE_URL||"");
 let url:URL;try{url=new URL(raw)}catch{throw new Error("PROD_BANK_DATABASE_NOT_CONFIGURED")}
 if(url.protocol!=="postgresql:"||
    url.username!=="sigapro_prod_webhook_worker"||
    !/^ep-blue-cloud-b4hhgb4t(?:-pooler)?\./.test(url.hostname)||
    url.pathname!=="/sigapro_migration_stage_20260923"||
    url.searchParams.get("sslmode")!=="require")
  throw new Error("PROD_BANK_DATABASE_BRANCH_OR_ROLE_MISMATCH");
 return raw;
}
function send(res:Res,status:number,data:Record<string,unknown>){
 res.statusCode=status;res.setHeader("Cache-Control","no-store");
 res.setHeader("Content-Type","application/json; charset=utf-8");
 res.end(JSON.stringify(data));
}
async function connect<T>(fn:(client:Db)=>Promise<T>):Promise<T>{
 const pg=requireNode("pg") as {Client:new(o:Record<string,unknown>)=>Db};
 const client=new pg.Client({connectionString:prodDatabaseUrl(),
  connectionTimeoutMillis:4500,statement_timeout:9500,query_timeout:9500});
 await client.connect();
 try{
  // Neon-managed roles may inherit neon_superuser, CREATEROLE or BYPASSRLS.
  // Reject them even if a Vercel secret points at the correct username.
  const check=await client.query(`SELECT (
    current_user='sigapro_prod_webhook_worker'
    AND NOT r.rolsuper AND NOT r.rolcreaterole
    AND NOT r.rolcreatedb AND NOT r.rolbypassrls
    AND NOT pg_has_role(current_user,'neon_superuser','member')
   ) AS limited_role FROM pg_catalog.pg_roles r
   WHERE r.rolname=current_user`,[]);
  if(check.rows[0]?.limited_role!==true)
    throw new Error("PROD_WORKER_EXCESSIVE_PRIVILEGES");
  return await fn(client);
 }finally{await client.end()}
}
async function readJson(req:Req,max:number){
 if(req.body!==undefined){
  const str=JSON.stringify(req.body);
  if(!str||str.length>max||!req.body||typeof req.body!=="object"||Array.isArray(req.body))
   throw new Error("INVALID_BODY");
  return req.body as Record<string,unknown>;
 }
 let n=0;const bytes:Buffer[]=[];
 for await (const c of req) {
  const b=Buffer.isBuffer(c)?c:Buffer.from(c as Uint8Array);
  n+=b.length;if(n>max)throw new Error("BODY_TOO_LARGE");bytes.push(b);
 }
 const data=JSON.parse(Buffer.concat(bytes).toString("utf8")||"{}") as unknown;
 if(!data||typeof data!=="object"||Array.isArray(data))throw new Error("INVALID_BODY");
 return data as Record<string,unknown>;
}
async function secrets(client:Db,municipalityId:string){
 const r=await client.query(
  "SELECT public.mp_prod_webhook_connection_v1($1::uuid) AS connection",[municipalityId]);
 const config=r.rows[0]?.connection as Record<string,unknown>|undefined;
 if(!config||config.municipality_id!==municipalityId||
   config.environment!=="production"||config.provider!=="mercado_pago")
   return null;
 const access=String(config.access_token_ciphertext||"");
 const secret=String(config.webhook_secret_ciphertext||"");
 if(!access||!secret)return null;
 return {accessToken:decryptPaymentAccessToken(access),webhookSecret:decryptPaymentWebhookSecret(secret)};
}
async function credit(client:Db,input:{
 municipalityId:string;orderId:string;paymentId:string;requestId:string;
 notificationId:string;payloadHash:string;
 observation:Awaited<ReturnType<typeof fetchMunicipalMpOrder>>;
}){
 const o=input.observation;
 const args=[input.municipalityId,input.orderId,input.paymentId,input.requestId,
 input.notificationId,input.payloadHash,o.reference,o.currency,o.status,o.statusDetail||"",
 o.transactionStatus||"",o.transactionStatusDetail||"",o.amount,
 o.paidAmount??null,o.transactionAmount??null,o.transactionPaidAmount??null,
 o.accredited===true];
 const r=await client.query(`SELECT public.mp_prod_record_accredited_order_v1(
  $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,
  $7::text,$8::text,$9::text,$10::text,$11::text,$12::text,
  $13::numeric,$14::numeric,$15::numeric,$16::numeric,$17::boolean
 ) AS outcome`,args);
 const x=r.rows[0]?.outcome as Record<string,unknown>|null|undefined;
 if(!x||typeof x.status!=="string")throw new Error("NO_BANK_AUDIT");
 return {status:String(x.status),settled:x.settled===true};
}
async function callback(req:Req,res:Res){
 const url=new URL(req.url||"/","https://sigapro.prod.invalid");
 const tenant=url.searchParams.get("municipality_id")||"";
 if(!uuid.test(tenant))return send(res,400,{ok:false,code:"MUNICIPALITY_REQUIRED"});
 const reqid=String(req.headers["x-request-id"]||"");
 const hmac=String(req.headers["x-signature"]||"");
 let notice:Record<string,unknown>;
 try{notice=await readJson(req,32768)}
 catch{return send(res,400,{ok:false,code:"INVALID_WEBHOOK"})}
 // An original order or transaction ID must come from query + signed body.
 // This is a real-mode-only worker: a test notification cannot settle a city.
 if(notice.live_mode!==true)return send(res,401,{ok:false,code:"LIVE_MODE_REQUIRED"});
 const sourceHash=createHash("sha256").update(JSON.stringify(notice)).digest("hex");
 try{
  const output=await connect(async db=>{
   const auth=await secrets(db,tenant);
   if(!auth)return {http:503,code:"MUNICIPAL_PROD_BANK_NOT_ACTIVE"};
   const valid=verifyMercadoPagoOrderWebhook({
    rawQueryId:url.searchParams.get("data.id"),
    queryTopic:url.searchParams.get("type"),
    headerSignature:hmac,requestId:reqid,notification:notice as MPOrderNotice,
    secret:auth.webhookSecret});
   if(!valid.ok)return {http:401,code:"INVALID_WEBHOOK_SIGNATURE"};
   let o;try{o=await fetchMunicipalMpOrder(valid.orderId,auth.accessToken)}
   catch{return {http:503,code:"BANK_FETCH_UNAVAILABLE"}}
   if(!o.fetched)return {http:503,code:"BANK_FETCH_UNAVAILABLE"};
   const result=await credit(db,{municipalityId:tenant,orderId:valid.orderId,
    paymentId:o.paymentId||"",requestId:reqid,
    notificationId:String(notice.id||reqid).slice(0,128),
    payloadHash:sourceHash,observation:o});
   return {http:result.status==="awaiting_original_pdf"?503:200,
    code:result.status,settled:result.settled};
  });
  return send(res,output.http,{ok:output.http===200,code:output.code,
   automaticallySettled:output.settled===true});
 }catch{
  console.warn("[sigapro-prod-webhook] provider_ingest_unavailable");
  return send(res,503,{ok:false,code:"PROD_WEBHOOK_UNAVAILABLE"});
 }
}
async function reconcileAfterPdf(req:Req,res:Res){
 if(!readBearer(req))return send(res,401,{ok:false,code:"AUTH_REQUIRED"});
 let body:Record<string,unknown>;
 try{body=await readJson(req,4096)}
 catch{return send(res,400,{ok:false,code:"INVALID_BODY"})}
 const municipalityId=String(body.municipalityId||"");
 const guideCode=String(body.guideCode||"");
 if(!uuid.test(municipalityId)||!guideCode||guideCode.length>120)
  return send(res,400,{ok:false,code:"INVALID_GUIDE"});
 try{
  // readStoredGuide enforces JWT+tenant+process authorization in Data API.
  const guide=await readStoredGuide(req,municipalityId,guideCode);
  if(guide.municipality_id!==municipalityId||guide.guide_number!==guideCode||
   !guide.process_id||guide.payment_provider!=="mercado_pago"||
   guide.provider_environment!=="production"||
   guide.collection_mode_snapshot!=="sigapro"||!guide.bank_reference||
   !guide.bank_payment_id)return send(res,403,{ok:false,code:"FORBIDDEN"});
  if(!guide.original_pdf_key||!guide.original_pdf_sha256||!guide.document_snapshot)
   return send(res,409,{ok:false,code:"ORIGINAL_REQUIRED"});
  return await connect(async db=>{
   const auth=await secrets(db,municipalityId);
   if(!auth)return send(res,503,{ok:false,code:"MUNICIPAL_PROD_BANK_NOT_ACTIVE"});
   const prior=await db.query(
    `SELECT request_id,notification_id,payload_sha256 FROM public.mp_prod_signed_order_receipts_v1
    WHERE municipality_id=$1::uuid AND guide_id=$2::uuid AND order_id=$3::text
      AND payment_id=$4::text AND signature_verified=true
    ORDER BY received_at DESC LIMIT 1`,
    [municipalityId,guide.id,guide.bank_reference,guide.bank_payment_id]);
   const event=prior.rows[0];
   if(!event)return send(res,409,{ok:false,code:"SIGNED_BANK_EVENT_REQUIRED"});
   let obs;try{obs=await fetchMunicipalMpOrder(guide.bank_reference!,auth.accessToken)}
   catch{return send(res,503,{ok:false,code:"BANK_FETCH_UNAVAILABLE"})}
   if(!obs.fetched)return send(res,503,{ok:false,code:"BANK_FETCH_UNAVAILABLE"});
   const result=await credit(db,{municipalityId,orderId:guide.bank_reference!,
    paymentId:obs.paymentId||"",requestId:String(event.request_id),
    notificationId:String(event.notification_id),payloadHash:String(event.payload_sha256),
    observation:obs});
   return send(res,200,{ok:true,status:result.status,settled:result.settled});
  });
 }catch{
  return send(res,503,{ok:false,code:"PROD_RECONCILIATION_UNAVAILABLE"});
 }
}
export default async function handleProductionWebhook(req:Req,res:Res){
 if(!prodEnv())return send(res,503,{ok:false,code:"PRODUCTION_ONLY"});
 if(req.method==="GET")return send(res,200,{ok:true,environment:"production",
  webhooksConfigured:Boolean(process.env.SIGAPRO_PROD_MP_WEBHOOK_DATABASE_URL),
  mode:"signed_order_accredited_after_original"});
 if(req.method!=="POST")return send(res,405,{ok:false,code:"METHOD_NOT_ALLOWED"});
 const url=new URL(req.url||"/","https://sigapro.prod.invalid");
 if(url.searchParams.get("mode")==="post-archive-reconcile")
  return reconcileAfterPdf(req,res);
 return callback(req,res);
}
