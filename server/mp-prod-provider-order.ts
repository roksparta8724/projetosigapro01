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
 const paymentId=single&&typeof single.id==="string"?single.id.slice(0,100):"";
 const transactionStatus=String(single?.status||"").slice(0,96);
 const transactionStatusDetail=String(single?.status_detail||"").slice(0,96);
 const transactionAmount=money(single?.amount);
 const transactionPaidAmount=money(single?.paid_amount);
 const noChargeback=Array.isArray(chargebacks)?chargebacks.length===0:chargebacks==null;
 const noRefund=Array.isArray(refunds)?refunds.length===0:refunds==null;
 const accredited=status==="processed"&&statusDetail==="accredited" &&
   transactionStatus==="processed"&&transactionStatusDetail==="accredited" &&
   currency==="BRL"&&(!raw.country_code||raw.country_code==="BRA") &&
   /^[A-Za-z0-9_-]{6,100}$/.test(paymentId) &&
   sameCents(amount,paidAmount,transactionAmount,transactionPaidAmount) &&
   noChargeback&&noRefund;
 return {fetched:true,status,statusDetail,reference:String(raw.external_reference||"").slice(0,160),
  currency:currency.slice(0,12),amount,paidAmount,paymentId,transactionStatus,
  transactionStatusDetail,transactionAmount,transactionPaidAmount,accredited};
}

