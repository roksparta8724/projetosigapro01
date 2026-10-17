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
