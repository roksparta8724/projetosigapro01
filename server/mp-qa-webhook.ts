/**
 * QA-only, fail-closed Mercado Pago Orders settlement. This handler MUST
 * NEVER be enabled for main/production or use a production DB connection.
 * It accepts test notifications only, independently verifies the HMAC,
 * refetches the order at Mercado Pago and calls limited Neon SECURITY
 * DEFINER RPCs as sigapro_qa_webhook_worker (never database owner).
 *
 * A signed webhook alone is insufficient to mark a guide paid: Neon also
 * enforces municipal scope, exact amount, original immutable PDF and
 * idempotent signed-receipt evidence.
 */
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import type {IncomingMessage,ServerResponse} from "node:http";
import {verifyMercadoPagoOrderWebhook,type MPOrderNotice} from "./mp-webhook-signature.js";
import {fetchMunicipalMpOrder} from "./mp-prod-order-observation.js";
import {decryptPaymentAccessToken,decryptPaymentWebhookSecret} from "./municipal-payment.js";
import {assertQaWorkerLeastPrivilege,MP_QA_WORKER_ROLE} from "./mp-webhook-worker-privilege.js";

type Req=IncomingMessage & {body?:unknown};
type Res=ServerResponse;
type Db={connect():Promise<void>;end():Promise<void>;
 query(sql:string,args:unknown[]):Promise<{rows:Array<Record<string,unknown>>}>};
const reqUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const providerId=/^[A-Za-z0-9_-]{6,100}$/;
const requestId=/^[A-Za-z0-9_-]{8,128}$/;
const requireNode=createRequire(import.meta.url);
const qaBranch="fix/qa-triagem-analise-pagamento-20261101";

export function isQaMpWebhookEnvironment(env:NodeJS.ProcessEnv=process.env):boolean{
 return env.VERCEL_ENV==="preview" && env.VERCEL_GIT_COMMIT_REF===qaBranch;
}

export function qaMpWebhookDatabaseUrl(env:NodeJS.ProcessEnv=process.env):string {
 if(!isQaMpWebhookEnvironment(env))throw new Error("QA_PREVIEW_BRANCH_REQUIRED");
 const raw=String(env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL||"");
 let url:URL;
 try{url=new URL(raw);}catch{throw new Error("QA_WORKER_DATABASE_NOT_CONFIGURED");}
 const sslmode=url.searchParams.get("sslmode");
 if(url.protocol!=="postgresql:" || url.username!==MP_QA_WORKER_ROLE ||
    !/^ep-misty-breeze-b4ri8ig0(?:-pooler)?\.c-6\.us-east-2\.aws\.neon\.tech$/.test(url.hostname) ||
    url.pathname!=="/sigapro_migration_stage_20260923" ||
    (sslmode!=="verify-full" && sslmode!=="require") ||
    url.searchParams.has("options") ||
    url.searchParams.has("service") ||
    url.searchParams.has("host") ||
    url.searchParams.has("user")) {
   throw new Error("QA_WORKER_DATABASE_BRANCH_OR_ROLE_MISMATCH");
 }
 url.searchParams.set("sslmode","verify-full");
 return url.toString();
}

function respond(res:Res,status:number,data:Record<string,unknown>):void {
 res.statusCode=status;
 res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.end(JSON.stringify(data));
}

async function readJson(req:Req,max:number):Promise<Record<string,unknown>> {
 if(req.body!==undefined){
   const encoded=JSON.stringify(req.body);
   if(!encoded||encoded.length>max||!req.body||
      typeof req.body!=="object"||Array.isArray(req.body))throw Error("INVALID_JSON");
   return req.body as Record<string,unknown>;
 }
 let size=0;
 const buffers:Buffer[]=[];
 for await (const piece of req) {
   const buf=Buffer.isBuffer(piece)?piece:Buffer.from(piece as Uint8Array);
   size+=buf.length;
   if(size>max)throw Error("BODY_LIMIT_EXCEEDED");
   buffers.push(buf);
 }
 const raw=Buffer.concat(buffers).toString("utf8");
 const data=JSON.parse(raw||"{}") as unknown;
 if(!data||Array.isArray(data)||typeof data!=="object")throw Error("INVALID_JSON");
 return data as Record<string,unknown>;
}

async function withQaWorker<T>(task:(db:Db)=>Promise<T>):Promise<T> {
 const pg=requireNode("pg") as {Client:new(options:Record<string,unknown>)=>Db};
 const db=new pg.Client({
   connectionString:qaMpWebhookDatabaseUrl(),
   connectionTimeoutMillis:4500,statement_timeout:9500,query_timeout:9500,
 });
 await db.connect();
 try{
   // The audit executes on the SAME login as the financial functions.
   await assertQaWorkerLeastPrivilege(db);
   return await task(db);
 } finally {await db.end();}
}

async function credentials(db:Db,municipalityId:string){
 const r=await db.query(
   "SELECT public.mp_qa_webhook_connection_v1($1::uuid) AS config",
   [municipalityId]);
 const item=r.rows[0]?.config as Record<string,unknown>|null|undefined;
 if(!item||item.municipality_id!==municipalityId||
    item.environment!=="test"||item.provider!=="mercado_pago")return null;
 const encryptedAccess=String(item.access_token_ciphertext||"");
 const encryptedSignature=String(item.webhook_secret_ciphertext||"");
 if(!encryptedAccess||!encryptedSignature)return null;
 return {token:decryptPaymentAccessToken(encryptedAccess),
   signingSecret:decryptPaymentWebhookSecret(encryptedSignature)};
}

export function shouldAttemptQaSettlement(input:{
 status:unknown;accredited:unknown;paymentId:unknown;receiptId:unknown;
}):boolean {
 return input.status==="verified_manual_review" &&
   input.accredited===true &&
   typeof input.paymentId==="string"&&providerId.test(input.paymentId) &&
   typeof input.receiptId==="string"&&reqUuid.test(input.receiptId);
}

/**
 * Deterministic, testable handoff after the HMAC and independent provider GET.
 * Never marks a guide paid directly. Neon owns original-PDF/idempotency checks.
 */
export async function recordAndMaybeSettleQa(
  db:Pick<Db,"query">,
  input:{
    municipalityId:string;orderId:string;requestId:string;notificationId:string;
    digest:string;observation:Awaited<ReturnType<typeof fetchMunicipalMpOrder>>;
  },
):Promise<{code:string;http:number;settled:boolean}>{
  const {municipalityId,orderId,requestId:rid,notificationId,digest,observation}=input;
  if(!observation.fetched)throw Error("QA_BANK_OBSERVATION_REQUIRED");
     const args=[
       municipalityId,orderId,rid,
       notificationId,digest,true,
       observation.status,observation.reference,observation.currency,
       observation.amount,
     ];
     const logged=await db.query(
       `SELECT public.mp_qa_webhook_ingest_v1(
          $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::boolean,
          $7::text,$8::text,$9::text,$10::numeric) AS receipt`,args);
     const receipt=logged.rows[0]?.receipt as Record<string,unknown>|undefined;
     if(!receipt||typeof receipt.status!=="string")
       throw Error("QA_RECEIPT_NOT_RECORDED");
     if(!shouldAttemptQaSettlement({
       status:receipt.status,accredited:observation.accredited,
       paymentId:observation.paymentId,receiptId:receipt.receipt_id,
     }))return {code:String(receipt.status),http:200,settled:false};

     const settled=await db.query(
       `SELECT public.mp_qa_webhook_settle_v1(
         $1::uuid,$2::uuid,$3::text,$4::text,$5::numeric,$6::text,
         $7::text,$8::text,$9::numeric,$10::numeric) AS result`,[
        receipt.receipt_id,municipalityId,orderId,observation.paymentId,
        observation.paidAmount??null,observation.statusDetail||"",
        observation.transactionStatus||"",observation.transactionStatusDetail||"",
        observation.transactionAmount??null,observation.transactionPaidAmount??null,
       ]);
     const outcome=settled.rows[0]?.result as Record<string,unknown>|undefined;
     if(!outcome||typeof outcome.status!=="string")
       throw Error("QA_SETTLEMENT_NOT_RECORDED");
     return {code:String(outcome.status),
       http:outcome.status==="awaiting_original_pdf"?503:200,
       settled:outcome.status==="settled_qa"||outcome.status==="already_settled_qa"};
}

async function handleSignedTestNotice(req:Req,res:Res){
 const url=new URL(req.url||"/","https://sigapro.qa.invalid");
 const municipalityId=url.searchParams.get("municipality_id")||"";
 if(!reqUuid.test(municipalityId))
   return respond(res,400,{ok:false,code:"MUNICIPALITY_REQUIRED"});
 const sig=String(req.headers["x-signature"]||"");
 const rid=String(req.headers["x-request-id"]||"");
 const order=url.searchParams.get("data.id")||"";
 if(!requestId.test(rid)||!providerId.test(order)||
    sig.length<70||sig.length>255 ||
    url.searchParams.get("type")!=="order")
   return respond(res,401,{ok:false,code:"INVALID_WEBHOOK_HEADER"});
 let notice:Record<string,unknown>;
 try{notice=await readJson(req,32768);}
 catch{return respond(res,400,{ok:false,code:"INVALID_WEBHOOK_BODY"});}
 // This QA endpoint cannot be used to settle a production live-mode order.
 if(notice.live_mode!==false)
   return respond(res,401,{ok:false,code:"TEST_ONLY"});
 const digest=createHash("sha256").update(JSON.stringify(notice)).digest("hex");
 try{
   const response=await withQaWorker(async db=>{
     const auth=await credentials(db,municipalityId);
     if(!auth)return {code:"MUNICIPAL_QA_PROVIDER_NOT_ACTIVE",http:503,settled:false};
     const signed=verifyMercadoPagoOrderWebhook({
       rawQueryId:order,queryTopic:url.searchParams.get("type"),
       headerSignature:sig,requestId:rid,
       notification:notice as MPOrderNotice,secret:auth.signingSecret,
     });
     if(!signed.ok)return {code:"INVALID_WEBHOOK_SIGNATURE",http:401,settled:false};
     let observation;
     try{observation=await fetchMunicipalMpOrder(signed.orderId,auth.token);}
     catch{return {code:"BANK_FETCH_UNAVAILABLE",http:503,settled:false};}
     if(!observation.fetched)
       return {code:"BANK_FETCH_UNAVAILABLE",http:503,settled:false};
     return recordAndMaybeSettleQa(db,{
       municipalityId,orderId:signed.orderId,requestId:rid,
       notificationId:String(notice.id||rid).slice(0,128),
       digest,observation,
     });
   });
   return respond(res,response.http,{ok:response.http===200,
      code:response.code,automaticallySettled:response.settled===true});
 }catch{
   // Do not log any request payload, token, signing secret or guide metadata.
   console.warn("[sigapro-qa-webhook] unavailable_or_denied");
   return respond(res,503,{ok:false,code:"QA_WEBHOOK_UNAVAILABLE"});
 }
}

export default async function handleQaMpWebhook(req:Req,res:Res){
 if(!isQaMpWebhookEnvironment())
   return respond(res,503,{ok:false,code:"QA_PREVIEW_ONLY"});
 const workerConfigured=Boolean(process.env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL);
 const encryptionConfigured=Boolean(String(process.env.MUNICIPAL_PAYMENT_MASTER_KEY||"").trim());
 if(req.method==="GET")
   return respond(res,200,{ok:true,environment:"qa",
     configured:workerConfigured&&encryptionConfigured,
     workerConfigured,encryptionConfigured,
     policy:"signed_test_order_after_original_pdf"});
 if(req.method!=="POST")
   return respond(res,405,{ok:false,code:"METHOD_NOT_ALLOWED"});
 // A missing encryption key must be shown as an actionable QA issue,
 // never become an opaque timeout or silently fall back to production.
 if(!workerConfigured||!encryptionConfigured)
   return respond(res,503,{ok:false,code:"QA_WEBHOOK_CREDENTIALS_NOT_CONFIGURED"});
 return handleSignedTestNotice(req,res);
}
