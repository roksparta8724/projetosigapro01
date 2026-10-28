import { backendClient } from "@/integrations/backend/databaseClient";
import { normalizeOfficialBanking } from "@/lib/bankCodes";

export type MercadoPagoGuideCharge = {
  ok: boolean;
  environment: "test" | "production";
  orderId?: string;
  paymentId?: string;
  externalReference?: string;
  status?: string;
  statusDetail?: string;
  amount?: string;
  ticketUrl?: string;
  barcodeContent?: string;
  digitableLine?: string;
  financialInstitution?: string;
  authenticatedAt?: string;
  error?: string;
  errorCode?: string;
  errorDetails?: string[];
};

export type QaPixCharge = {
  ok: boolean;
  sandboxOnly: true;
  environment?: "test";
  orderId?: string;
  paymentId?: string;
  qrCode?: string;
  status?: string;
  statusStale?: boolean;
  error?: string;
};

/** The browser NEVER receives Access Tokens or a raw municipal PIX key. */
export async function requestQaPixCharge(input: {
  municipalityId: string; guideCode: string; action: "issue" | "get";
}): Promise<QaPixCharge> {
  if (import.meta.env.VITE_SIGAPRO_NEON_ISOLATED !== "true")
    throw new Error("PIX de homologação indisponível fora do ambiente isolado.");
  const sessionResult=await backendClient.auth.getSession();
  const session=sessionResult?.data?.session;
  const token=session?.access_token || session?.accessToken || session?.token || "";
  if(!token) throw new Error("Entre novamente para autenticar o teste PIX.");
  const response=await fetch("/api/qa/mercadopago/guide-pix",{
    method:"POST",
    headers:{Accept:"application/json","Content-Type":"application/json",Authorization:`Bearer ${token}`},
    body:JSON.stringify(input),
  });
  const result=(await response.json().catch(()=>null)) as QaPixCharge | null;
  if(!response.ok || !result?.ok || !result.sandboxOnly){
    if (input.action==="get" && result?.error?.includes("ainda não emitido"))
      return {ok:false,sandboxOnly:true};
    throw new Error(result?.error||"Não foi possível consultar o PIX de teste.");
  }
  return result;
}

export type MercadoPagoGuideChargeInput = {
  municipalityId?: string | null;
  guideCode: string;
  amount: number;
  dueDate?: string;
  description?: string;
};

function cacheKey(input: MercadoPagoGuideChargeInput) {
  return [
    "sigapro",
    "mercadopago",
    "guide-v5",
    input.municipalityId || "fallback",
    input.guideCode,
    Number(input.amount || 0).toFixed(2),
    input.dueDate || "",
  ].join(":");
}

function readCachedCharge(input: MercadoPagoGuideChargeInput) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(input));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MercadoPagoGuideCharge;
    const lineDigits = String(parsed?.digitableLine || "").replace(/\D/g, "");
    const barcodeDigits = String(parsed?.barcodeContent || "").replace(/\D/g, "");
    const validLine = lineDigits.length === 47 || lineDigits.length === 48;
    const validBarcode =
      barcodeDigits.length >= 40 &&
      barcodeDigits.length <= 48 &&
      barcodeDigits.length % 2 === 0;
    return parsed?.ok && validLine && validBarcode ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedCharge(
  input: MercadoPagoGuideChargeInput,
  charge: MercadoPagoGuideCharge,
) {
  if (typeof window === "undefined" || !charge.ok) return;
  try {
    window.sessionStorage.setItem(cacheKey(input), JSON.stringify(charge));
  } catch {
    // Cache é apenas conveniência local; a guia continua funcionando sem ele.
  }
}

async function refreshMercadoPagoGuideCharge(
  input: MercadoPagoGuideChargeInput,
  cached: MercadoPagoGuideCharge,
) {
  if (!cached.orderId) return cached;

  let authorization = "";
  try {
    const sessionResult = await backendClient?.auth?.getSession?.();
    const session = sessionResult?.data?.session ?? null;
    authorization =
      session?.access_token ||
      session?.accessToken ||
      session?.token ||
      "";
  } catch {
    authorization = "";
  }

  try {
    const response = await fetch("/api/mercadopago/guide-status", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
      },
      body: JSON.stringify({
        municipalityId: input.municipalityId,
        orderId: cached.orderId,
        guideCode: input.guideCode,
        amount: input.amount,
      }),
    });
    const payload = (await response.json().catch(() => null)) as MercadoPagoGuideCharge | null;
    if (!response.ok || !payload?.ok) return cached;
    writeCachedCharge(input, payload);
    return payload;
  } catch {
    return cached;
  }
}

export async function ensureMercadoPagoGuideCharge(
  input: MercadoPagoGuideChargeInput,
  options?: { isolatedSandboxOnly?: boolean },
): Promise<MercadoPagoGuideCharge> {
  // Always resolve the canonical Neon record. Browser storage is not proof
  // of persistence and must never bypass a paid/original-guide check.

  let authorization = "";
  try {
    const sessionResult = await backendClient?.auth?.getSession?.();
    const session = sessionResult?.data?.session ?? null;
    authorization =
      session?.access_token ||
      session?.accessToken ||
      session?.token ||
      "";
  } catch {
    authorization = "";
  }

  const response = await fetch(
    options?.isolatedSandboxOnly
      ? "/api/qa/mercadopago/guide-boleto"
      : "/api/mercadopago/guide-boleto", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as MercadoPagoGuideCharge | null;
  if (!payload) {
    throw new Error(`Resposta inválida do Mercado Pago (HTTP ${response.status}).`);
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Mercado Pago recusou a cobrança da guia.");
  }
  const banking = normalizeOfficialBanking(payload.barcodeContent, payload.digitableLine);
  if (!banking.barcode || !banking.digitableLine) {
    throw new Error(
      "Mercado Pago criou a cobrança, mas não retornou linha digitável e código de barras completos.",
    );
  }

  payload.barcodeContent = banking.barcode;
  payload.digitableLine = banking.digitableLine;

  writeCachedCharge(input, payload);
  return payload;
}

export type QaPixReconciliation={ok:boolean;status:string;settled:boolean};
/** Fresh provider-only reconciliation after original PDF upload, never a new order. */
export async function reconcileQaPixAfterPdf(input:{municipalityId:string;guideCode:string})
 :Promise<QaPixReconciliation>{
 if(import.meta.env.VITE_SIGAPRO_NEON_ISOLATED!=="true")
  throw new Error("Conciliação de homologação indisponível fora do QA.");
 const response=await backendClient.auth.getSession();
 const session=response?.data?.session;
 const token=session?.access_token||session?.accessToken||session?.token||"";
 if(!token)throw new Error("Entre novamente para conferir a conciliação PIX.");
 const res=await fetch("/api/qa/mercadopago/guide-reconcile",{
  method:"POST",headers:{Authorization:`Bearer ${token}`,Accept:"application/json",
   "Content-Type":"application/json"},body:JSON.stringify(input),cache:"no-store",
 });
 const result=await res.json().catch(()=>null) as (QaPixReconciliation&{code?:string})|null;
 if(!res.ok||!result?.ok){
  if(result?.code==="QA_SIGNED_WEBHOOK_REQUIRED")
   throw new Error("Aguardando webhook assinado do banco; nenhuma baixa efetuada.");
  if(result?.code==="QA_ORIGINAL_PDF_REQUIRED")
   throw new Error("Arquive e abra o PDF original antes de conciliar o PIX.");
  throw new Error("Consulta bancária QA indisponível ou não autorizada ("+String(result?.code||res.status)+").");
 }
 return result;
}
