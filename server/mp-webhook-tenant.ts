import { createRequire } from "node:module";
import { decryptPaymentAccessToken, decryptPaymentWebhookSecret } from "./municipal-payment.js";

const requireNode = createRequire(import.meta.url);
type SqlResult = { rows: Array<Record<string, unknown>> };
type SqlClient = { connect():Promise<void>; end():Promise<void>; query(sql:string,args:unknown[]):Promise<SqlResult> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function onlyQaDatabaseUrl() {
 const raw=String(process.env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL||"");
 if(!raw) throw new Error("QA_WEBHOOK_DATABASE_NOT_CONFIGURED");
 let u:URL;
 try{u=new URL(raw)}catch{throw new Error("QA_WEBHOOK_DATABASE_INVALID_URL")}
 // A dedicated Postgres login on the Neon QA compute, never the owner URL.
 if(u.protocol!=="postgresql:"||u.username!=="sigapro_qa_webhook_worker"||
   !/^ep-misty-breeze-b4ri8ig0(?:-pooler)?\./.test(u.hostname)||
   u.pathname!=="/sigapro_migration_stage_20260923"||
   u.searchParams.get("sslmode")!=="require") throw new Error("QA_WEBHOOK_DATABASE_BRANCH_OR_ROLE_MISMATCH");
 return raw;
}
function exactQaBranch() {
 return process.env.VERCEL_ENV==="preview" &&
   process.env.VITE_SIGAPRO_NEON_ISOLATED==="true" &&
   process.env.VERCEL_GIT_COMMIT_REF==="qa/sigapro-ia-logo-integrado-20261023";
}
export function qaWebhookConfigured() {
 return exactQaBranch() && Boolean(process.env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL);
}
export async function withWebhookConnection<T>(
 fn:(client:SqlClient)=>Promise<T>,
):Promise<T> {
 if(!exactQaBranch()) throw new Error("QA_WEBHOOK_BRANCH_MISMATCH");
 const connectionString=onlyQaDatabaseUrl();
 const module=requireNode("pg") as { Client:new(options:Record<string,unknown>)=>SqlClient };
 const client=new module.Client({connectionString,connectionTimeoutMillis:4500,statement_timeout:8500,query_timeout:8500});
 await client.connect();
 try{return await fn(client)}finally{await client.end()}
}

export async function readQaMunicipalPaymentSecret(client:SqlClient,municipalityId:string){
 if(!UUID.test(municipalityId)) return null;
 const response=await client.query("SELECT public.mp_qa_webhook_connection_v1($1::uuid) AS connection",[municipalityId]);
 const row=response.rows[0]?.connection as Record<string,unknown>|null|undefined;
 if(!row || row.municipality_id!==municipalityId || row.environment!=="test" || row.provider!=="mercado_pago") return null;
 const accessCiphertext=String(row.access_token_ciphertext||"");
 const webhookCiphertext=String(row.webhook_secret_ciphertext||"");
 if(!accessCiphertext||!webhookCiphertext) return null;
 return {
  accessToken:decryptPaymentAccessToken(accessCiphertext),
  webhookSecret:decryptPaymentWebhookSecret(webhookCiphertext),
 };
}
export type MpOrderObservation = {
  fetched:boolean;status:string;reference:string;currency:string;amount:number|null;
  statusDetail?:string;paidAmount?:number|null;paymentId?:string;
  transactionStatus?:string;transactionStatusDetail?:string;
  transactionAmount?:number|null;transactionPaidAmount?:number|null;
  accredited?:boolean;
};
function money(value:unknown):number|null {
 const raw=typeof value==="string"||typeof value==="number"?String(value):"";
 if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(raw))return null;
 const n=Number(raw);
 return Number.isSafeInteger(Math.round(n*100))?Math.round(n*100)/100:null;
}
function sameCents(...values:(number|null)[]):boolean {
 return values.length>0 && values.every(v=>v!==null&&v>0&&Math.round(v*100)===Math.round(values[0]! *100));
}
export async function fetchMunicipalMpOrder(orderId:string,token:string):Promise<MpOrderObservation>{
 const response=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(orderId),{
  method:"GET",headers:{Accept:"application/json",Authorization:`Bearer ${token}`},
  signal:AbortSignal.timeout(6500),
 });
 if(!response.ok) return {fetched:false,status:"provider_http_"+response.status,reference:"",currency:"",amount:null};
 const raw=await response.json().catch(()=>null) as Record<string,unknown>|null;
 if(!raw||String(raw.id||"").toLowerCase()!==orderId.toLowerCase()) return {fetched:false,status:"provider_order_mismatch",reference:"",currency:"",amount:null};
 const amount=money(raw.total_amount);
 const paidAmount=money(raw.total_paid_amount);
 // Orders v1 returns "currency" (e.g. BRL). Older provider shapes may
 // use "currency_id". Reject contradictory values rather than guess a unit.
 const officialCurrency=typeof raw.currency==="string"?raw.currency.trim():"";
 const legacyCurrency=typeof raw.currency_id==="string"?raw.currency_id.trim():"";
 const currency=officialCurrency&&legacyCurrency&&officialCurrency!==legacyCurrency
  ?"":officialCurrency||legacyCurrency;
 const status=String(raw.status||"").slice(0,96);
 const statusDetail=String(raw.status_detail||"").slice(0,96);
 const transactions=raw.transactions && typeof raw.transactions==="object"
  ?raw.transactions as Record<string,unknown>:null;
 const payments=transactions?.payments;
 const chargebacks=transactions?.chargebacks;
 const refunds=transactions?.refunds;
 // A municipal guide has ONE provider-issued PIX payment. Missing transaction
 // evidence, partial refunds and chargebacks must never trigger officialization.
 const single=Array.isArray(payments)&&payments.length===1 &&
   payments[0]&&typeof payments[0]==="object"
   ?payments[0] as Record<string,unknown>:null;
 const method=single?.payment_method && typeof single.payment_method==="object"
  ?single.payment_method as Record<string,unknown>:null;
 // Orders API can omit currency; an online Brazilian PIX bank transfer
 // is BRL. This exception MUST NOT apply to boleto, cards or missing evidence.
 const verifiedCurrency=currency || (!officialCurrency && !legacyCurrency &&
   raw.country_code==="BRA" && raw.type==="online" &&
   method?.id==="pix" && method?.type==="bank_transfer"?"BRL":"");
 const paymentId=single&&typeof single.id==="string"?single.id.slice(0,100):"";
 const transactionStatus=String(single?.status||"").slice(0,96);
 const transactionStatusDetail=String(single?.status_detail||"").slice(0,96);
 const transactionAmount=money(single?.amount);
 const transactionPaidAmount=money(single?.paid_amount);
 const noChargeback=Array.isArray(chargebacks)?chargebacks.length===0:chargebacks==null;
 const noRefund=Array.isArray(refunds)?refunds.length===0:refunds==null;
 const accredited=status==="processed"&&statusDetail==="accredited" &&
   transactionStatus==="processed"&&transactionStatusDetail==="accredited" &&
   verifiedCurrency==="BRL"&&(!raw.country_code||raw.country_code==="BRA") &&
   /^[A-Za-z0-9_-]{6,100}$/.test(paymentId) &&
   sameCents(amount,paidAmount,transactionAmount,transactionPaidAmount) &&
   noChargeback&&noRefund;
 return {fetched:true,status,statusDetail,reference:String(raw.external_reference||"").slice(0,160),
  currency:verifiedCurrency.slice(0,12),amount,paidAmount,paymentId,transactionStatus,
  transactionStatusDetail,transactionAmount,transactionPaidAmount,accredited};
}

export async function persistQaOrderEvent(
 client:SqlClient,input:{
  municipalityId:string;orderId:string;requestId:string;notificationId:string;payloadHash:string;observation:MpOrderObservation;
 }):Promise<{receipt_id:string;status:string;matched:boolean;attempts:number}>{
 const r=await client.query(`SELECT public.mp_qa_webhook_ingest_v1(
  $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::boolean,$7::text,$8::text,$9::text,$10::numeric
 ) AS receipt`,[
 input.municipalityId,input.orderId,input.requestId,input.notificationId,input.payloadHash,
 input.observation.fetched,input.observation.status,input.observation.reference,
 input.observation.currency,input.observation.amount,
 ]);
 const record=r.rows[0]?.receipt as Record<string,unknown>|null;
 if(!record?.receipt_id || !record?.status) throw new Error("QA_WEBHOOK_DURABLE_RECEIPT_NOT_CONFIRMED");
 const receipt={receipt_id:String(record.receipt_id),status:String(record.status),
  matched:Boolean(record.matched),attempts:Number(record.attempts||1)};
 // Only the server's tenant-specific, authenticated provider GET can establish
 // accreditation. The SQL function independently validates *every* persisted
 // guide, bank order, receipt, PDF hash and exact monetary field under locks.
 if(input.observation.accredited===true && receipt.status==="verified_manual_review" && receipt.matched){
  const settled=await client.query(`SELECT public.mp_qa_webhook_settle_v1(
    $1::uuid,$2::uuid,$3::text,$4::text,$5::numeric,
    $6::text,$7::text,$8::text,$9::numeric,$10::numeric
  ) AS result`,[
   receipt.receipt_id,input.municipalityId,input.orderId,input.observation.paymentId||"",
   input.observation.paidAmount,input.observation.statusDetail||"",
   input.observation.transactionStatus||"",input.observation.transactionStatusDetail||"",
   input.observation.transactionAmount,input.observation.transactionPaidAmount,
  ]);
  const result=settled.rows[0]?.result as Record<string,unknown>|undefined;
  if(!result?.status)throw new Error("QA_BANK_RECONCILIATION_RECEIPT_REQUIRED");
  return {...receipt,status:String(result.status),matched:result.matched===true};
 }
 return receipt;
}
