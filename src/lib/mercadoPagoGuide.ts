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
  guideCode: string;
  amount: number;
  dueDate?: string;
  description?: string;
};

function cacheKey(input: MercadoPagoGuideChargeInput) {
  return [
    "sigapro",
    "mercadopago",
    "guide",
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
    return parsed?.ok ? parsed : null;
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

  const response = await fetch("/api/mercadopago/guide-boleto", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
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
