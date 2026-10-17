import {
  type MunicipalPaymentConnection,
  decryptPaymentAccessToken,
  encryptPaymentAccessToken,
  encryptPaymentWebhookSecret,
  getMunicipalPaymentSecretAdmin,
  paymentCredentialFingerprint,
  paymentWebhookFingerprint,
  testMercadoPagoToken,
} from "../server/municipal-payment";
import { callDataApiRpc } from "../server/municipal-storage";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: Req) {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function municipalityIdFrom(body: Record<string, unknown>) {
  const id = typeof body.municipalityId === "string" ? body.municipalityId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Prefeitura inválida.");
  }
  return id;
}

async function rpcOrThrow<T>(
  req: Req,
  fn: string,
  body: Record<string, unknown>,
) {
  const result = await callDataApiRpc<T>(req, fn, body);
  if (!result.ok) {
    throw new Error(result.error || "Operação de pagamento não autorizada.");
  }
  return result.payload;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Método não permitido." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const action = typeof body.action === "string" ? body.action : "get";
    const municipalityId = municipalityIdFrom(body);

    if (action === "get") {
      const connection = await rpcOrThrow<MunicipalPaymentConnection>(
        req,
        "get_municipal_payment_connection_v1",
        { _municipality_id: municipalityId },
      );
      json(res, 200, connection || {});
      return;
    }

    if (action === "save") {
      const provider = String(body.provider || "manual").trim();
      const environment = String(body.environment || "test").trim();
      const accessToken = String(body.accessToken || "").trim();
      const webhookSecret = String(body.webhookSecret || "").trim();

      if (!["mercado_pago", "bank_direct", "manual"].includes(provider)) {
        throw new Error("Provedor de pagamento inválido.");
      }
      if (!["test", "production"].includes(environment)) {
        throw new Error("Ambiente de pagamento inválido.");
      }

      let accessCiphertext: string | null = null;
      let accessFingerprint: string | null = null;
      let webhookCiphertext: string | null = null;
      let webhookFingerprint: string | null = null;

      if (accessToken) {
        accessCiphertext = encryptPaymentAccessToken(accessToken);
        accessFingerprint = paymentCredentialFingerprint(accessToken);
      }
      if (webhookSecret) {
        webhookCiphertext = encryptPaymentWebhookSecret(webhookSecret);
        webhookFingerprint = paymentWebhookFingerprint(webhookSecret);
      }

      const connection = await rpcOrThrow<MunicipalPaymentConnection>(
        req,
        "save_municipal_payment_connection_v1",
        {
          _municipality_id: municipalityId,
          _provider: provider,
          _environment: environment,
          _credentials_ciphertext: accessCiphertext,
          _credential_fingerprint: accessFingerprint,
          _webhook_secret_ciphertext: webhookCiphertext,
          _webhook_fingerprint: webhookFingerprint,
        },
      );
      json(res, 200, connection || {});
      return;
    }

    if (action === "test") {
      const secretConfig = await getMunicipalPaymentSecretAdmin(req, municipalityId);
      if (secretConfig.provider !== "mercado_pago") {
        throw new Error("O teste automático atual está disponível para Mercado Pago.");
      }
      if (!secretConfig.credentials_ciphertext) {
        throw new Error("Salve o Access Token da Prefeitura antes de testar.");
      }

      try {
        const result = await testMercadoPagoToken(
          decryptPaymentAccessToken(secretConfig.credentials_ciphertext),
        );
        const connection = await rpcOrThrow<MunicipalPaymentConnection>(
          req,
          "mark_municipal_payment_test_v1",
          {
            _municipality_id: municipalityId,
            _ok: true,
            _message: `Conexão Mercado Pago validada. Boleto: ${result.boletoAvailable ? "sim" : "não"} · PIX: ${result.pixAvailable ? "sim" : "não"}.`,
          },
        );
        json(res, 200, {
          ...(connection || {}),
          testOk: true,
          boletoAvailable: result.boletoAvailable,
          pixAvailable: result.pixAvailable,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha no teste do provedor.";
        await rpcOrThrow<MunicipalPaymentConnection>(
          req,
          "mark_municipal_payment_test_v1",
          {
            _municipality_id: municipalityId,
            _ok: false,
            _message: message,
          },
        ).catch(() => null);
        json(res, 400, { error: message, testOk: false });
      }
      return;
    }

    if (action === "activate") {
      const connection = await rpcOrThrow<MunicipalPaymentConnection>(
        req,
        "activate_municipal_payment_connection_v1",
        { _municipality_id: municipalityId },
      );
      json(res, 200, connection || {});
      return;
    }

    json(res, 400, { error: "Ação de pagamento inválida." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao configurar pagamentos.";
    console.error("[SIGAPRO][MunicipalPayment] configuração", { error: message });
    json(res, 400, { error: message });
  }
}
