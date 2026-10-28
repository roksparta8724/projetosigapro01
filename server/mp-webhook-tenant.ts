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
};
export async function fetchMunicipalMpOrder(orderId:string,token:string):Promise<MpOrderObservation>{
 const response=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(orderId),{
  method:"GET",headers:{Accept:"application/json",Authorization:`Bearer ${token}`},
  signal:AbortSignal.timeout(6500),
 });
 if(!response.ok) return {fetched:false,status:"provider_http_"+response.status,reference:"",currency:"",amount:null};
 const raw=await response.json().catch(()=>null) as Record<string,unknown>|null;
 if(!raw||String(raw.id||"").toLowerCase()!==orderId.toLowerCase()) return {fetched:false,status:"provider_order_mismatch",reference:"",currency:"",amount:null};
 const total=String(raw.total_amount??"");
 const amount=/^\d+(?:\.\d{1,2})?$/.test(total)?Number(total):null;
 // Orders v1 returns "currency" (e.g. BRL). Older provider shapes may
 // use "currency_id". Reject contradictory values rather than guess a unit.
 const officialCurrency=typeof raw.currency==="string"?raw.currency.trim():"";
 const legacyCurrency=typeof raw.currency_id==="string"?raw.currency_id.trim():"";
 const currency=officialCurrency&&legacyCurrency&&officialCurrency!==legacyCurrency
  ?"":officialCurrency||legacyCurrency;
 const status=String(raw.status||"").slice(0,96);
 return {fetched:true,status,reference:String(raw.external_reference||"").slice(0,160),currency:currency.slice(0,12),amount};
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
 return {receipt_id:String(record.receipt_id),status:String(record.status),matched:Boolean(record.matched),attempts:Number(record.attempts||1)};
}
