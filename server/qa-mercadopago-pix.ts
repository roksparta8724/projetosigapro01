/**
 * Localhost:8081 ONLY: independent Mercado Pago PIX sandbox order for a DAM
 * already issued as a boleto. No production charge, R2 write or paid status.
 * The PIX response is kept only in an isolated per-Neon-branch local file.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ApiReq } from "./municipal-storage";
import { callDataApiRpc, getDataApiUrl, readEnv } from "./municipal-storage";
import { readStoredGuide } from "./guide-persistence";
import { resolveMercadoPagoMunicipalAccessToken } from "./municipal-payment";
import { isValidPixPayload } from "../src/lib/pix";

export type QaPixResult = {
  ok: boolean;
  sandboxOnly: true;
  orderId?: string;
  paymentId?: string;
  qrCode?: string;
  environment?: "test";
  status?: string;
  error?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireQaEnvironment() {
  if (readEnv("SIGAPRO_LOCAL_QA_LAUNCH") !== "true" ||
      readEnv("SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES") !== "true" ||
      readEnv("VITE_SIGAPRO_NEON_ISOLATED") !== "true") {
    throw new Error("PIX de teste indisponível fora do localhost:8081 isolado.");
  }
  const url = new URL(getDataApiUrl());
  if (url.protocol !== "https:" || !url.hostname.startsWith("ep-") ||
      !url.hostname.includes(".apirest.")) {
    throw new Error("Neon isolado não identificado.");
  }
  return createHash("sha256").update(url.host + url.pathname).digest("hex").slice(0, 20);
}

type Store = {
  state: "pending" | "issued";
  orderId?: string;
  paymentId?: string;
  qrCode?: string;
  status?: string;
  amount: string;
  guideCode: string;
  municipalityId: string;
};

function pathFor(branch: string, municipalityId: string, guideCode: string) {
  const key = createHash("sha256").update([branch,municipalityId,guideCode,"mercadopago-pix-qa-v1"].join(":")).digest("hex");
  return join(homedir(),".sigapro","isolated-qa-pix",branch,key+".json");
}

async function safeRead(file: string): Promise<Store | null> {
  try {
    const value = JSON.parse(await readFile(file,"utf8")) as Store;
    return value && (value.state === "issued" || value.state === "pending") ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function response(store: Store | null): QaPixResult {
  if (!store) return {ok:false,sandboxOnly:true,error:"PIX de teste ainda não emitido."};
  if (!store.qrCode || !isValidPixPayload(store.qrCode) || !store.orderId) {
    return {ok:false,sandboxOnly:true,error:"Emissão PIX pendente. A mesma order deve ser consultada; não crie uma nova cobrança."};
  }
  return {ok:true,sandboxOnly:true,environment:"test",orderId:store.orderId,
    paymentId:store.paymentId,qrCode:store.qrCode,status:store.status};
}

export async function qaMercadoPagoPix(
  req: ApiReq, input: {municipalityId:string;guideCode:string;action:"get"|"issue"},
): Promise<QaPixResult> {
  const branch = requireQaEnvironment();
  if (!uuidPattern.test(input.municipalityId) || !/^DAM-PRE-[A-Za-z0-9-]{8,100}$/.test(input.guideCode)) {
    throw new Error("Identificação de guia de homologação inválida.");
  }
  const guide = await readStoredGuide(req,input.municipalityId,input.guideCode);
  if (guide.guide_number !== input.guideCode || guide.municipality_id !== input.municipalityId ||
      !Number.isFinite(Number(guide.amount)) || Number(guide.amount) <= 0) {
    throw new Error("Guia original não autorizada para emissão PIX de teste.");
  }
  // Use the already-granted QA RPCs, never the private internal guard that
  // deliberately has no EXECUTE grant for authenticated clients.
  const authFn = guide.bank_reference
    ? "qa_authorize_payment_guide_provider_sync_v1"
    : "qa_authorize_payment_guide_charge_v1";
  const access = await callDataApiRpc<boolean>(req,authFn,{
    _municipality_id:input.municipalityId,_guide_code:input.guideCode,
    ...(guide.bank_reference ? {_bank_reference:guide.bank_reference} : {}),
  });
  if (!access.ok || access.payload !== true) throw new Error("Sem autorização para esta guia de homologação.");
  const path=pathFor(branch,input.municipalityId,input.guideCode);
  let stored=await safeRead(path);
  if(input.action==="get") return response(stored);

  const resolved=await resolveMercadoPagoMunicipalAccessToken(req,input.municipalityId);
  if(resolved.environment!=="test" || !resolved.token) {
    throw new Error("Somente credenciais Mercado Pago de TESTE são aceitas.");
  }
  const amount=Number(guide.amount).toFixed(2);
  if(stored && (stored.amount!==amount || stored.municipalityId!==input.municipalityId ||
      stored.guideCode!==input.guideCode)) throw new Error("O PIX QA não corresponde à guia original.");
  if(stored?.state==="issued") return response(stored);

  const externalReference=input.guideCode+"-PIX-QA";
  let order: Record<string,any> | null = null;
  if(stored?.orderId){
    // Recover an already-created order, never create a second one.
    const res=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(stored.orderId),{
      method:"GET",headers:{Authorization:"Bearer "+resolved.token,Accept:"application/json"},
    });
    order=res.ok ? await res.json().catch(()=>null) : null;
    if(!order) throw new Error("Order PIX de testes não encontrada. Uma nova cobrança foi bloqueada.");
  }else{
    if(stored) throw new Error("Emissão PIX iniciada; status incerto. Nova order bloqueada para evitar duplicação.");
    await mkdir(dirname(path),{recursive:true,mode:0o700});
    const pending:Store={state:"pending",amount,guideCode:input.guideCode,municipalityId:input.municipalityId};
    // Exclusive reservation per guide prevents concurrent or accidental duplicate POSTs.
    try {await writeFile(path,JSON.stringify(pending),{flag:"wx",mode:0o600});}
    catch(error){
      if((error as NodeJS.ErrnoException).code==="EEXIST") throw new Error("PIX de teste já está sendo preparado.");
      throw error;
    }
    const res=await fetch("https://api.mercadopago.com/v1/orders",{
      method:"POST",
      headers:{Authorization:"Bearer "+resolved.token,Accept:"application/json","Content-Type":"application/json"},
      body:JSON.stringify({
        type:"online",external_reference:externalReference,total_amount:amount,
        payer:{email:"test@testuser.com",first_name:"APRO"},
        transactions:{payments:[{amount,payment_method:{id:"pix",type:"bank_transfer"}}]},
      }),
    });
    order=await res.json().catch(()=>null);
    if(!res.ok){
      // An explicit HTTP refusal is safe to retry; unknown network errors are not.
      await unlink(path).catch(()=>{});
      throw new Error("Mercado Pago recusou o PIX de teste: "+String(order?.message || order?.error || res.status));
    }
  }
  if(!order || typeof order.id!=="string" || order.external_reference!==externalReference ||
      Number(order.total_amount)!==Number(amount)) {
    throw new Error("Order PIX de teste não corresponde à guia. Reemissão bloqueada.");
  }
  const payment=order.transactions?.payments?.[0];
  if(payment?.payment_method?.id!=="pix" || payment?.payment_method?.type!=="bank_transfer"){
    throw new Error("O provedor não retornou uma transação PIX de homologação.");
  }
  const qr=String(payment.payment_method.qr_code||"");
  stored={state:qr&&isValidPixPayload(qr)?"issued":"pending",
    amount,guideCode:input.guideCode,municipalityId:input.municipalityId,
    orderId:String(order.id),paymentId:String(payment.id||""),
    qrCode:qr,status:String(payment.status||order.status||"")};
  await writeFile(path,JSON.stringify(stored),{flag:"w",mode:0o600});
  return response(stored);
}
