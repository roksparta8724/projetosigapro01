import { createHash } from "node:crypto";
type MercadoPagoEnvironment = "test" | "production";

export type MercadoPagoConnectionCheck = {
  ok: boolean;
  configured: boolean;
  environment: MercadoPagoEnvironment;
  boletoAvailable: boolean;
  pixAvailable: boolean;
  availableMethods: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  error?: string;
  errorCode?: string;
  errorDetails?: string[];
};

function cleanEnv(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/^['"]|['"]$/g, "").trim()
    : "";
}

export function getMercadoPagoEnvironment(): MercadoPagoEnvironment {
  return cleanEnv(process.env.MERCADOPAGO_ENV).toLowerCase() === "production"
    ? "production"
    : "test";
}

export function getMercadoPagoAccessToken() {
  const environment = getMercadoPagoEnvironment();
  if (environment === "production") {
    return cleanEnv(process.env.MERCADOPAGO_ACCESS_TOKEN_PROD);
  }
  return cleanEnv(process.env.MERCADOPAGO_ACCESS_TOKEN_TEST);
}

export async function checkMercadoPagoConnection(): Promise<MercadoPagoConnectionCheck> {
  const environment = getMercadoPagoEnvironment();
  const token = getMercadoPagoAccessToken();

  if (!token) {
    return {
      ok: false,
      configured: false,
      environment,
      boletoAvailable: false,
      pixAvailable: false,
      availableMethods: [],
      error:
        environment === "production"
          ? "Access Token de produção não configurado."
          : "Access Token de teste não configurado.",
    };
  }

  try {
    const response = await fetch("https://api.mercadopago.com/v1/payment_methods", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload && typeof payload === "object"
          ? String(
              (payload as Record<string, unknown>).message ||
                (payload as Record<string, unknown>).error ||
                `HTTP ${response.status}`,
            )
          : `HTTP ${response.status}`;

      return {
        ok: false,
        configured: true,
        environment,
        boletoAvailable: false,
        pixAvailable: false,
        availableMethods: [],
        error: `Mercado Pago recusou a credencial: ${message}`,
      };
    }

    const rows = Array.isArray(payload) ? payload : [];
    const availableMethods = rows
      .map((row) => {
        const source =
          row && typeof row === "object"
            ? (row as Record<string, unknown>)
            : {};
        return {
          id: String(source.id || ""),
          name: String(source.name || source.id || ""),
          type: String(source.payment_type_id || ""),
        };
      })
      .filter((row) => row.id)
      .slice(0, 80);

    const boletoAvailable = availableMethods.some(
      (method) =>
        method.id.toLowerCase() === "boleto" ||
        (method.type.toLowerCase() === "ticket" &&
          /boleto/i.test(`${method.id} ${method.name}`)),
    );
    const pixAvailable = availableMethods.some(
      (method) =>
        method.id.toLowerCase() === "pix" ||
        (method.type.toLowerCase() === "bank_transfer" &&
          /pix/i.test(`${method.id} ${method.name}`)),
    );

    return {
      ok: true,
      configured: true,
      environment,
      boletoAvailable,
      pixAvailable,
      availableMethods,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      environment,
      boletoAvailable: false,
      pixAvailable: false,
      availableMethods: [],
      error:
        error instanceof Error
          ? `Falha de rede ao consultar o Mercado Pago: ${error.message}`
          : "Falha de rede ao consultar o Mercado Pago.",
    };
  }
}


export type MercadoPagoGuideBoletoInput = {
  guideCode: string;
  amount: number;
  dueDate?: string;
  description?: string;
};

export type MercadoPagoGuideBoletoResult = {
  ok: boolean;
  environment: MercadoPagoEnvironment;
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

function stableUuidFromText(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const normalized = hex.join("");
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}

function normalizeGuideCode(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function extractMercadoPagoGuideResult(
  payload: unknown,
  environment: MercadoPagoEnvironment,
  externalReference: string,
  amountText: string,
): MercadoPagoGuideBoletoResult {
  const source =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const transactions =
    source.transactions && typeof source.transactions === "object"
      ? (source.transactions as Record<string, unknown>)
      : {};
  const payments = Array.isArray(transactions.payments)
    ? transactions.payments
    : [];
  const payment =
    payments[0] && typeof payments[0] === "object"
      ? (payments[0] as Record<string, unknown>)
      : {};
  const paymentMethod =
    payment.payment_method && typeof payment.payment_method === "object"
      ? (payment.payment_method as Record<string, unknown>)
      : {};

  return {
    ok: true,
    environment,
    orderId: String(source.id || ""),
    paymentId: String(payment.id || ""),
    externalReference: String(source.external_reference || externalReference),
    status: String(source.status || payment.status || ""),
    statusDetail: String(source.status_detail || payment.status_detail || ""),
    amount: String(source.total_amount || payment.amount || amountText),
    ticketUrl: String(paymentMethod.ticket_url || ""),
    barcodeContent: String(paymentMethod.barcode_content || ""),
    digitableLine: String(paymentMethod.digitable_line || ""),
    financialInstitution: String(
      paymentMethod.financial_institution || "Mercado Pago",
    ),
  };
}

function hasCompleteGuideBankingData(result: MercadoPagoGuideBoletoResult) {
  const lineDigits = String(result.digitableLine || "").replace(/\D/g, "");
  const barcodeDigits = String(result.barcodeContent || "").replace(/\D/g, "");
  return (
    (lineDigits.length === 47 || lineDigits.length === 48) &&
    barcodeDigits.length >= 40 &&
    barcodeDigits.length <= 48 &&
    barcodeDigits.length % 2 === 0
  );
}

async function refetchMercadoPagoOrder(
  orderId: string,
  token: string,
  environment: MercadoPagoEnvironment,
  externalReference: string,
  amountText: string,
) {
  if (!orderId) return null;
  const response = await fetch(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) return null;
  return extractMercadoPagoGuideResult(
    payload,
    environment,
    externalReference,
    amountText,
  );
}

function extractMercadoPagoError(
  source: Record<string, unknown>,
  status: number,
) {
  const rawErrors = Array.isArray(source.errors)
    ? source.errors
    : Array.isArray(source.cause)
      ? source.cause
      : [];
  const errorDetails = rawErrors
    .map((item) => {
      if (!item || typeof item !== "object") return String(item || "");
      const detail = item as Record<string, unknown>;
      const code = String(detail.code || detail.error || "").trim();
      const message = String(
        detail.message || detail.description || detail.detail || "",
      ).trim();
      const path = String(
        detail.path || detail.property || detail.field || "",
      ).trim();
      return [code, path, message].filter(Boolean).join(" · ");
    })
    .filter(Boolean);

  const errorCode = String(source.code || source.error || "").trim();
  const topMessage = String(source.message || source.detail || "").trim();

  return {
    errorCode: errorCode || undefined,
    errorDetails,
    message:
      errorDetails[0] ||
      topMessage ||
      errorCode ||
      `HTTP ${status}`,
  };
}

export async function createMercadoPagoGuideBoleto(
  input: MercadoPagoGuideBoletoInput,
): Promise<MercadoPagoGuideBoletoResult> {
  const environment = getMercadoPagoEnvironment();
  const token = getMercadoPagoAccessToken();
  const guideCode = normalizeGuideCode(input.guideCode);
  const amount = Number(input.amount);

  if (!token) {
    return {
      ok: false,
      environment,
      error:
        environment === "production"
          ? "Access Token de produção não configurado."
          : "Access Token de teste não configurado.",
    };
  }

  if (!guideCode) {
    return {
      ok: false,
      environment,
      error: "A guia do SIGAPRO não possui número válido para vincular à cobrança.",
    };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      environment,
      error: "A guia do SIGAPRO não possui valor válido para cobrança.",
    };
  }

  const amountText = amount.toFixed(2);
  const externalReference = guideCode;
  const idempotencyKey = stableUuidFromText(
    `sigapro|${environment}|${guideCode}|${amountText}|${input.dueDate || ""}|v4`,
  );

  const payment: Record<string, unknown> = {
    amount: amountText,
    payment_method: {
      id: "boleto",
      type: "ticket",
    },
  };
  // No sandbox do Mercado Pago usamos apenas dados de comprador de teste.
  // Em produção, a integração deverá usar os dados reais do contribuinte.
  const payer =
    environment === "test"
      ? {
          email: "test@testuser.com",
          first_name: "John",
          last_name: "Doe",
          identification: {
            type: "CPF",
            number: "99999999999",
          },
          address: {
            street_name: "Av. das Nacoes Unidas",
            street_number: "3003",
            zip_code: "06233903",
            neighborhood: "Bonfim",
            state: "SP",
            city: "Osasco",
          },
        }
      : undefined;

  if (environment !== "test") {
    return {
      ok: false,
      environment,
      error:
        "A cobrança real ainda está bloqueada. Primeiro valide o fluxo completo no ambiente de teste.",
    };
  }

  const body: Record<string, unknown> = {
    type: "online",
    external_reference: externalReference,
    processing_mode: "automatic",
    total_amount: amountText,
    description:
      String(input.description || `SIGAPRO - ${guideCode}`).slice(0, 120),
    payer,
    transactions: {
      payments: [payment],
    },
  };

  try {
    const response = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    const source =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};

    if (!response.ok) {
      const parsedError = extractMercadoPagoError(source, response.status);
      return {
        ok: false,
        environment,
        externalReference,
        errorCode: parsedError.errorCode,
        errorDetails: parsedError.errorDetails,
        error: `Mercado Pago recusou a cobrança da guia: ${parsedError.message}`,
      };
    }

    let result = extractMercadoPagoGuideResult(
      source,
      environment,
      externalReference,
      amountText,
    );

    if (!hasCompleteGuideBankingData(result) && result.orderId) {
      const refreshed = await refetchMercadoPagoOrder(
        result.orderId,
        token,
        environment,
        externalReference,
        amountText,
      );
      if (refreshed) result = refreshed;
    }

    if (!hasCompleteGuideBankingData(result)) {
      return {
        ...result,
        ok: false,
        error:
          "O Mercado Pago criou a cobrança, mas não devolveu linha digitável e código de barras em formato bancário completo.",
      };
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      environment,
      externalReference,
      error:
        error instanceof Error
          ? `Falha de rede ao criar a cobrança da guia: ${error.message}`
          : "Falha de rede ao criar a cobrança da guia.",
    };
  }
}
