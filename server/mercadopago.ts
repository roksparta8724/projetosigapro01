import { randomUUID } from "node:crypto";
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


export type MercadoPagoTestBoletoResult = {
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
};

export async function createMercadoPagoTestBoleto(): Promise<MercadoPagoTestBoletoResult> {
  const environment = getMercadoPagoEnvironment();
  const token = getMercadoPagoAccessToken();

  if (environment !== "test") {
    return {
      ok: false,
      environment,
      error: "A emissão de boleto teste está bloqueada fora do ambiente de teste.",
    };
  }

  if (!token) {
    return {
      ok: false,
      environment,
      error: "Access Token de teste não configurado.",
    };
  }

  const externalReference = `sigapro_test_${Date.now()}`;
  const idempotencyKey = randomUUID();

  const body = {
    type: "online",
    external_reference: externalReference,
    processing_mode: "automatic",
    total_amount: "1.00",
    description: "SIGAPRO - boleto de teste",
    payer: {
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
    },
    transactions: {
      payments: [
        {
          amount: "1.00",
          expiration_time: "P3D",
          payment_method: {
            id: "boleto",
            type: "ticket",
          },
        },
      ],
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
      const message = String(
        source.message ||
          source.error ||
          source.cause ||
          `HTTP ${response.status}`,
      );
      return {
        ok: false,
        environment,
        externalReference,
        error: `Mercado Pago recusou o boleto teste: ${message}`,
      };
    }

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
      amount: String(source.total_amount || payment.amount || "1.00"),
      ticketUrl: String(paymentMethod.ticket_url || ""),
      barcodeContent: String(paymentMethod.barcode_content || ""),
      digitableLine: String(paymentMethod.digitable_line || ""),
      financialInstitution: String(paymentMethod.financial_institution || ""),
    };
  } catch (error) {
    return {
      ok: false,
      environment,
      externalReference,
      error:
        error instanceof Error
          ? `Falha de rede ao criar boleto teste: ${error.message}`
          : "Falha de rede ao criar boleto teste.",
    };
  }
}
