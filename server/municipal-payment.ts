import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  type ApiReq,
  callDataApiRpc,
  readEnv,
} from "./municipal-storage";

export type MunicipalPaymentConnection = {
  municipality_id?: string;
  provider?: "mercado_pago" | "bank_direct" | "manual";
  environment?: "test" | "production";
  status?: "inactive" | "configured" | "active" | "error";
  credentials_configured?: boolean;
  credential_fingerprint?: string;
  webhook_configured?: boolean;
  webhook_fingerprint?: string;
  credentials_ciphertext?: string;
  webhook_secret_ciphertext?: string;
  last_tested_at?: string | null;
  last_test_status?: string | null;
  last_test_message?: string | null;
  updated_at?: string | null;
};

function paymentEncryptionKey() {
  const secret = readEnv("MUNICIPAL_PAYMENT_MASTER_KEY");
  if (!secret) {
    throw new Error(
      "A chave mestre MUNICIPAL_PAYMENT_MASTER_KEY ainda não foi configurada no ambiente seguro do SIGAPRO.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptSecret(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", paymentEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(normalized, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptSecret(value: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = String(value || "").split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Credencial de pagamento armazenada em formato inválido.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    paymentEncryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptPaymentAccessToken(accessToken: string) {
  if (!accessToken.trim()) {
    throw new Error("Informe o Access Token do provedor.");
  }
  return encryptSecret(accessToken);
}

export function encryptPaymentWebhookSecret(webhookSecret: string) {
  if (!webhookSecret.trim()) return "";
  return encryptSecret(webhookSecret);
}

export function encryptMunicipalCollectionSecret(secret: string) {
  if (!secret.trim()) throw new Error("Informe a credencial da integração municipal.");
  return encryptSecret(secret);
}

export function municipalCollectionSecretFingerprint(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return `MUN · ${createHash("sha256").update(normalized).digest("hex").slice(0, 12).toUpperCase()}`;
}

export function decryptPaymentAccessToken(ciphertext: string) {
  return decryptSecret(ciphertext);
}

export function decryptPaymentWebhookSecret(ciphertext: string) {
  return decryptSecret(ciphertext);
}

export function paymentCredentialFingerprint(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const digest = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  const suffix = normalized.slice(-4);
  return `MP…${suffix} · ${digest}`;
}

export function paymentWebhookFingerprint(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const digest = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  return `WH · ${digest}`;
}

export async function getMunicipalPaymentConnection(
  req: ApiReq,
  municipalityId: string,
) {
  const result = await callDataApiRpc<MunicipalPaymentConnection>(
    req,
    "get_municipal_payment_connection_v1",
    { _municipality_id: municipalityId },
  );
  if (!result.ok) {
    throw new Error(
      result.error || "Não foi possível carregar o provedor de pagamento.",
    );
  }
  return result.payload || {};
}

export async function getMunicipalPaymentSecretAdmin(
  req: ApiReq,
  municipalityId: string,
) {
  const result = await callDataApiRpc<MunicipalPaymentConnection>(
    req,
    "get_municipal_payment_secret_admin_v1",
    { _municipality_id: municipalityId },
  );
  if (!result.ok) {
    throw new Error(
      result.error || "Não foi possível carregar a credencial de pagamento.",
    );
  }
  return result.payload || {};
}

export async function resolveMunicipalPaymentSecret(
  req: ApiReq,
  municipalityId: string,
) {
  const result = await callDataApiRpc<MunicipalPaymentConnection>(
    req,
    "resolve_municipal_payment_secret_v1",
    { _municipality_id: municipalityId },
  );
  if (!result.ok) {
    throw new Error(
      result.error || "Não foi possível resolver o provedor de pagamento.",
    );
  }
  return result.payload || {};
}

export async function resolveMercadoPagoMunicipalAccessToken(
  req: ApiReq,
  municipalityId: string | null | undefined,
) {
  if (municipalityId) {
    try {
      const config = await resolveMunicipalPaymentSecret(req, municipalityId);
      if (
        config.provider === "mercado_pago" &&
        config.status === "active" &&
        config.credentials_ciphertext
      ) {
        return {
          token: decryptPaymentAccessToken(config.credentials_ciphertext),
          environment:
            config.environment === "production" ? "production" : "test",
          source: "municipality" as const,
          connection: config,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (!/does not exist|schema cache|not found|autentica[cç][aã]o necess[aá]ria/i.test(message)) {
        throw error;
      }
    }
  }

  const environment =
    readEnv("MERCADOPAGO_ENV").toLowerCase() === "production"
      ? "production"
      : "test";
  const token =
    environment === "production"
      ? readEnv("MERCADOPAGO_ACCESS_TOKEN_PROD")
      : readEnv("MERCADOPAGO_ACCESS_TOKEN_TEST");

  return {
    token,
    environment,
    source: "environment" as const,
    connection: null,
  };
}

export async function testMercadoPagoToken(accessToken: string) {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("Access Token não configurado.");

  const response = await fetch("https://api.mercadopago.com/v1/payment_methods", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const source =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    throw new Error(
      String(source.message || source.error || `HTTP ${response.status}`),
    );
  }

  const rows = Array.isArray(payload) ? payload : [];
  const methods = rows
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
    .filter((row) => row.id);

  return {
    ok: true,
    boletoAvailable: methods.some(
      (method) =>
        method.id.toLowerCase() === "boleto" ||
        (method.type.toLowerCase() === "ticket" &&
          /boleto/i.test(`${method.id} ${method.name}`)),
    ),
    pixAvailable: methods.some(
      (method) =>
        method.id.toLowerCase() === "pix" ||
        /pix/i.test(`${method.id} ${method.name}`),
    ),
    methods,
  };
}
