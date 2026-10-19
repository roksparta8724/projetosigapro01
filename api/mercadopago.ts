import {
  checkMercadoPagoConnection,
  createMercadoPagoGuideBoleto,
  getMercadoPagoGuideBoletoStatus,
} from "../server/mercadopago";
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

type Req = import("http").IncomingMessage & {
  method?: string;
  body?: Record<string, unknown>;
};
type Res = import("http").ServerResponse;

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: Req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
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
  const requestUrl = new URL(req.url || "/api/mercadopago", "https://sigapro.local");
  const action = requestUrl.searchParams.get("action") || "health";

  if (action === "health") {
    if (req.method !== "GET") {
      json(res, 405, { ok: false, error: "Método não permitido." });
      return;
    }

    const municipalityId = requestUrl.searchParams.get("municipalityId");
    const result = await checkMercadoPagoConnection(req, municipalityId);
    json(res, result.ok ? 200 : result.configured ? 502 : 503, result);
    return;
  }

  if (action === "guide-status") {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Método não permitido." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const guideCode = String(body.guideCode || "");
      const result = await getMercadoPagoGuideBoletoStatus(
        {
          municipalityId: body.municipalityId ? String(body.municipalityId) : undefined,
          orderId: String(body.orderId || ""),
          guideCode,
          amount: Number(body.amount || 0),
        },
        req,
      );

      if (result.ok) {
        await rpcOrThrow(req, "persist_payment_guide_provider_charge_v1", {
          _guide_code: guideCode,
          _order_id: result.orderId || null,
          _payment_id: result.paymentId || null,
          _status: result.status || null,
          _status_detail: result.statusDetail || null,
          _authenticated_at: result.authenticatedAt || null,
          _payment_provider: "mercado_pago",
          _provider_environment: result.environment || null,
          _barcode: result.barcodeContent || null,
          _digitable_line: result.digitableLine || null,
          _ticket_url: result.ticketUrl || null,
        });
      }

      json(res, result.ok ? 200 : 400, result);
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Requisição inválida.",
      });
    }
    return;
  }

  if (action === "payment-connection") {
    if (req.method !== "POST") {
      json(res, 405, { error: "Método não permitido." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const subaction = typeof body.action === "string" ? body.action : "get";
      const municipalityId = municipalityIdFrom(body);

      if (subaction === "get") {
        const connection = await rpcOrThrow<MunicipalPaymentConnection>(
          req,
          "get_municipal_payment_connection_v1",
          { _municipality_id: municipalityId },
        );
        json(res, 200, connection || {});
        return;
      }

      if (subaction === "save") {
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

      if (subaction === "test") {
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

      if (subaction === "activate") {
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
    return;
  }

  if (action === "guide-boleto") {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Método não permitido." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const guideCode = String(body.guideCode || "");
      const result = await createMercadoPagoGuideBoleto(
        {
          municipalityId: body.municipalityId ? String(body.municipalityId) : undefined,
          guideCode,
          amount: Number(body.amount || 0),
          dueDate: body.dueDate ? String(body.dueDate) : undefined,
          description: body.description ? String(body.description) : undefined,
        },
        req,
      );

      if (result.ok) {
        await rpcOrThrow(req, "persist_payment_guide_provider_charge_v1", {
          _guide_code: guideCode,
          _order_id: result.orderId || null,
          _payment_id: result.paymentId || null,
          _status: result.status || null,
          _status_detail: result.statusDetail || null,
          _authenticated_at: result.authenticatedAt || null,
          _payment_provider: "mercado_pago",
          _provider_environment: result.environment || null,
          _barcode: result.barcodeContent || null,
          _digitable_line: result.digitableLine || null,
          _ticket_url: result.ticketUrl || null,
        });
      }

      json(res, result.ok ? 201 : 400, result);
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Requisição inválida.",
      });
    }
    return;
  }

  json(res, 404, { ok: false, error: "Ação Mercado Pago não encontrada." });
}
