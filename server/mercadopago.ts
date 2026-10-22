import { createHash } from "node:crypto";
import type { ApiReq } from "./municipal-storage";
import { resolveMercadoPagoMunicipalAccessToken } from "./municipal-payment";
import { assertGuideProviderSyncAccess, assertGuideProviderWriteAccess, persistGuideCharge, readStoredGuide, storedGuideCharge } from "./guide-persistence";
import { normalizeOfficialBanking } from "../src/lib/bankCodes";
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

export async function checkMercadoPagoConnection(
  req?: ApiReq,
  municipalityId?: string | null,
): Promise<MercadoPagoConnectionCheck> {
  let resolved: { token: string; environment: MercadoPagoEnvironment };
  try {
    resolved = req
      ? await resolveMercadoPagoMunicipalAccessToken(req, municipalityId)
      : {
          token: getMercadoPagoAccessToken(),
          environment: getMercadoPagoEnvironment(),
        };
  } catch (error) {
    // Health checks must report a missing municipal provider, not crash or
    // query a globally configured Mercado Pago account.
    return {
      ok: false,
      configured: false,
      environment: "test",
      boletoAvailable: false,
      pixAvailable: false,
      availableMethods: [],
      error: error instanceof Error ? error.message : "Conexão municipal indisponível.",
    };
  }
  const environment: MercadoPagoEnvironment = resolved.environment === "production" ? "production" : "test";
  const token = resolved.token;

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
  municipalityId?: string;
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
  authenticatedAt?: string;
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

  const status = String(source.status || payment.status || "");
  const statusDetail = String(source.status_detail || payment.status_detail || "");
  const paid =
    status.toLowerCase() === "processed" &&
    statusDetail.toLowerCase() === "accredited";
  const authenticatedAt = paid
    ? String(
        payment.date_approved ||
          payment.date_last_updated ||
          source.last_updated_date ||
          source.date_last_updated ||
          source.updated_at ||
          "",
      )
    : "";
  const banking = normalizeOfficialBanking(String(paymentMethod.barcode_content || ""), String(paymentMethod.digitable_line || ""));
  return {
    ok: true,
    environment,
    orderId: String(source.id || ""),
    paymentId: String(payment.id || ""),
    externalReference: String(source.external_reference || externalReference),
    status,
    statusDetail,
    amount: String(source.total_amount || payment.amount || amountText),
    ticketUrl: String(paymentMethod.ticket_url || ""),
    barcodeContent: banking.barcode,
    digitableLine: banking.digitableLine,
    financialInstitution: String(
      paymentMethod.financial_institution || "Mercado Pago",
    ),
    authenticatedAt: authenticatedAt || undefined,
  };
}

function hasCompleteGuideBankingData(result: MercadoPagoGuideBoletoResult) {
  const lineDigits = String(result.digitableLine || "").replace(/\D/g, "");
  const barcodeDigits = String(result.barcodeContent || "").replace(/\D/g, "");
  return (
    (lineDigits.length === 47 || lineDigits.length === 48) &&
    barcodeDigits.length === 44
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

export async function getMercadoPagoGuideBoletoStatus(
  input: { municipalityId?: string; orderId: string; guideCode: string; amount: number },
  req?: ApiReq,
  options?: { isolatedSandboxOnly?: boolean },
): Promise<MercadoPagoGuideBoletoResult> {
  const stored = req ? await readStoredGuide(req, input.municipalityId, input.guideCode) : null;
  if (stored) {
    if (stored.status === "compensada") return storedGuideCharge(stored);
    if (!stored.bank_reference || stored.bank_reference !== input.orderId) {
      throw new Error("Cobrança não vinculada à guia original.");
    }
    input = { ...input, guideCode: stored.guide_number, amount: Number(stored.amount) };
    await assertGuideProviderSyncAccess(req!, stored, options?.isolatedSandboxOnly);
  }
  const resolved = req
    ? await resolveMercadoPagoMunicipalAccessToken(req, input.municipalityId)
    : { token: getMercadoPagoAccessToken(), environment: getMercadoPagoEnvironment() };
  const environment: MercadoPagoEnvironment = resolved.environment === "production" ? "production" : "test";
  const token = resolved.token;
  if (!token) {
    return { ok: false, environment, error: "Credencial do Mercado Pago não configurada." };
  }
  if (!input.orderId) {
    return { ok: false, environment, error: "Order do Mercado Pago não informado." };
  }
  const amountText = Number(input.amount || 0).toFixed(2);
  const result = await refetchMercadoPagoOrder(
    input.orderId,
    token,
    environment,
    normalizeGuideCode(input.guideCode),
    amountText,
  );
  if (!result) {
    return { ok: false, environment, error: "Não foi possível consultar a situação da cobrança no Mercado Pago." };
  }
  return stored && req ? persistGuideCharge(req, stored, result, options?.isolatedSandboxOnly) : result;
}
/**
 * QA sandbox billing is only allowed for an already-existing, authorized
 * unpaid guide in the isolated Neon database. This optional guard MUST be
 * enforced before ANY external order request. Production uses the old route.
 */
export async function createMercadoPagoGuideBoleto(
  input: MercadoPagoGuideBoletoInput,
  req?: ApiReq,
  options?: { isolatedSandboxOnly?: boolean },
): Promise<MercadoPagoGuideBoletoResult> {
  if (options?.isolatedSandboxOnly) {
    if (
      !req ||
      process.env.SIGAPRO_LOCAL_QA_LAUNCH !== "true" ||
      process.env.SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES !== "true" ||
      process.env.VITE_SIGAPRO_NEON_ISOLATED !== "true"
    ) throw new Error("Boleto de teste disponível apenas no localhost:8081 isolado.");
    const sandboxConnection = await resolveMercadoPagoMunicipalAccessToken(req, input.municipalityId);
    if (sandboxConnection.environment !== "test") {
      throw new Error("Conta de produção bloqueada: utilize exclusivamente as credenciais de homologação do Mercado Pago.");
    }
  }
  const stored = req ? await readStoredGuide(req, input.municipalityId, input.guideCode) : null;
  if (stored) {
    if (stored.status === "compensada" || (stored.barcode && stored.digitable_line)) {
      return storedGuideCharge(stored);
    }
    if (stored.bank_reference) {
      return getMercadoPagoGuideBoletoStatus({
        municipalityId: stored.municipality_id, guideCode: stored.guide_number,
        orderId: stored.bank_reference, amount: Number(stored.amount),
      }, req, options);
    }
    input = { ...input, guideCode: stored.guide_number, amount: Number(stored.amount), dueDate: stored.due_date };
    await assertGuideProviderWriteAccess(req!, stored, options?.isolatedSandboxOnly);
  }
  const resolved = req
    ? await resolveMercadoPagoMunicipalAccessToken(req, input.municipalityId)
    : {
        token: getMercadoPagoAccessToken(),
        environment: getMercadoPagoEnvironment(),
      };
  const environment: MercadoPagoEnvironment = resolved.environment === "production" ? "production" : "test";
  if (options?.isolatedSandboxOnly && (!stored || environment !== "test")) {
    throw new Error("Somente guia pré-existente do Neon isolado e credencial de TESTE podem emitir boleto de homologação.");
  }
  const token = resolved.token;
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
    `sigapro|${input.municipalityId || "test"}|${environment}|${stored?.id || guideCode}|v5`,
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

  let providerAcceptedOrder = false;
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

    // Once the provider accepts the request, subsequent failures may come
    // from Neon persistence or from a status lookup, NOT from initial network.
    providerAcceptedOrder = true;
    let result = extractMercadoPagoGuideResult(
      source,
      environment,
      externalReference,
      amountText,
    );

    // Persist even an incomplete response: a retry must query this order,
    // never issue another charge because the bank has not supplied the bars yet.
    let persistedResult = stored && req ? await persistGuideCharge(req, stored, result, options?.isolatedSandboxOnly) : result;

    if (!hasCompleteGuideBankingData(result) && result.orderId) {
      const refreshed = await refetchMercadoPagoOrder(
        result.orderId,
        token,
        environment,
        externalReference,
        amountText,
      );
      if (refreshed) {
        result = refreshed;
        persistedResult = stored && req ? await persistGuideCharge(req, stored, result, options?.isolatedSandboxOnly) : result;
      }
    }

    if (!hasCompleteGuideBankingData(result)) {
      return {
        ...result,
        ok: false,
        error:
          "O Mercado Pago criou a cobrança, mas não devolveu linha digitável e código de barras em formato bancário completo.",
      };
    }

    return stored && req ? persistedResult : result;
  } catch (error) {
    const details = error instanceof Error ? error.message : "Falha desconhecida.";
    return {
      ok: false,
      environment,
      externalReference,
      errorCode: providerAcceptedOrder
        ? "PROVIDER_ACCEPTED_PERSISTENCE_OR_SYNC_FAILED"
        : "PROVIDER_REQUEST_FAILED",
      error: providerAcceptedOrder
        ? `O Mercado Pago respondeu à emissão, mas o SIGAPRO não conseguiu concluir a gravação ou consulta no Neon: ${details}. Utilize a mesma guia e a mesma ação; o identificador de idempotência permanece fixo para evitar duplicação.`
        : `Não foi possível concluir a comunicação com o Mercado Pago: ${details}. A mesma guia conserva a chave de idempotência em uma nova tentativa.`,
    };
  }
}
