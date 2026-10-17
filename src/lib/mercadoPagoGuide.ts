import { backendClient } from "@/integrations/backend/databaseClient";

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
  error?: string;
  errorCode?: string;
  errorDetails?: string[];
};

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

export async function ensureMercadoPagoGuideCharge(
  input: MercadoPagoGuideChargeInput,
): Promise<MercadoPagoGuideCharge> {
  const cached = readCachedCharge(input);
  if (cached) return cached;

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

  const response = await fetch("/api/mercadopago/guide-boleto", {
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
  if (!payload.ok) {
    throw new Error(payload.error || "Mercado Pago recusou a cobrança da guia.");
  }
  if (!payload.digitableLine?.trim() || !payload.barcodeContent?.trim()) {
    throw new Error(
      "Mercado Pago criou a cobrança, mas não retornou linha digitável e código de barras completos.",
    );
  }

  writeCachedCharge(input, payload);
  return payload;
}
