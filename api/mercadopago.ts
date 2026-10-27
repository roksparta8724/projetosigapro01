import {
  checkMercadoPagoConnection,
  createMercadoPagoGuideBoleto,
  getMercadoPagoGuideBoletoStatus,
} from "../server/mercadopago.js";
import {
  type MunicipalPaymentConnection,
  decryptPaymentAccessToken,
  encryptPaymentAccessToken,
  encryptPaymentWebhookSecret,
  getMunicipalPaymentSecretAdmin,
  paymentCredentialFingerprint,
  paymentWebhookFingerprint,
  testMercadoPagoToken,
} from "../server/municipal-payment.js";
import { callDataApiRpc } from "../server/municipal-storage.js";
import { readStoredGuide } from "../server/guide-persistence.js";
import { resolveMercadoPagoMunicipalAccessToken } from "../server/municipal-payment.js";

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

  // The isolated preview inherits payment metadata that could reference a real
  // provider. Never contact Mercado Pago or generate a charge from QA without
  // a dedicated sandbox integration and explicit test-only credentials.
  const isolatedQa = process.env.VERCEL_ENV === "preview" &&
    (process.env.VITE_SIGAPRO_NEON_ISOLATED === "true" ||
     process.env.VERCEL_GIT_COMMIT_REF === "qa/sigapro-ia-logo-integrado-20261023");
  // Preview payments remain fail-closed by default. Only the EXACT isolated
  // QA git branch can opt into credential setup. This does not enable charges.
  // Test orders require an independent, explicit server-side opt-in.
  const qaExactBranch = process.env.VERCEL_ENV === "preview" &&
    process.env.VITE_SIGAPRO_NEON_ISOLATED === "true" &&
    process.env.VERCEL_GIT_COMMIT_REF === "qa/sigapro-ia-logo-integrado-20261023";
  const qaSetupEnabled = qaExactBranch &&
    process.env.SIGAPRO_QA_MP_SETUP_OPT_IN === "QA_ONLY_TEST_CREDENTIALS" &&
    String(process.env.MUNICIPAL_PAYMENT_MASTER_KEY || "").length >= 32 &&
    /^[a-f0-9]{64}$/.test(String(process.env.SIGAPRO_BANK_CHARGE_SIGNING_SECRET || ""));
  const qaChargesEnabled = qaSetupEnabled &&
    process.env.SIGAPRO_QA_MP_CHARGE_OPT_IN === "QA_ONLY_TEST_ORDERS";

  if (isolatedQa && !qaSetupEnabled) {
    json(res, 503, {
      ok: false,
      code: "QA_PAYMENT_PROVIDER_DISABLED",
      error: "A homologação bancária exige chave QA exclusiva e opção explícita de credenciais de Teste.",
    });
    return;
  }

  if (isolatedQa && action === "health") {
    json(res, 200, {
      ok: true, configured: false, environment: "test",
      code: "QA_TEST_CREDENTIAL_SETUP_AVAILABLE",
      testAccountVerified: false, orderCreationEnabled: qaChargesEnabled,
    });
    return;
  }

  // Even after credential setup is enabled, no order or status request may
  // reach Mercado Pago without a second QA-only opt-in.
  if (isolatedQa && ["guide-boleto", "guide-status"].includes(action) && !qaChargesEnabled) {
    json(res, 503, {
      ok: false, code: "QA_PAYMENT_CHARGES_DISABLED",
      error: "Emissão e consulta bancária aguardam credencial de Teste validada e autorização isolada.",
    });
    return;
  }

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
      if (isolatedQa) {
        if (!/^Bearer\s+\S+$/i.test(String(req.headers?.authorization || ""))) {
          json(res, 401, { ok: false, code: "QA_AUTH_REQUIRED" }); return;
        }
        const id = municipalityIdFrom(body);
        const guide = await readStoredGuide(req, id, guideCode);
        if (!guide) {
          json(res, 403, { ok: false, code: "QA_CANONICAL_GUIDE_REQUIRED" }); return;
        }
        const resolved = await resolveMercadoPagoMunicipalAccessToken(req, id);
        if (resolved.environment !== "test") {
          json(res, 403, { ok: false, code: "QA_TEST_CREDENTIALS_ONLY" }); return;
        }
      }
      const result = await getMercadoPagoGuideBoletoStatus(
        {
          municipalityId: body.municipalityId ? String(body.municipalityId) : undefined,
          orderId: String(body.orderId || ""),
          guideCode,
          amount: Number(body.amount || 0),
        },
        req,
      );

      // getMercadoPagoGuideBoletoStatus / createMercadoPagoGuideBoleto
      // already persist via persistGuideCharge (municipality + guide ID,
      // verified external reference and amount). Never repeat with legacy
      // persist_payment_guide_provider_charge_v1: it selects by guide number
      // without municipality and can target another city's identical code.
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

      // In QA, only Mercado Pago TEST is configurable. No bank-direct,
      // manual or production-account integration may inherit QA credentials.
      if (isolatedQa && subaction === "save" &&
        (String(body.provider || "") !== "mercado_pago" ||
         String(body.environment || "") !== "test")) {
        json(res, 403, { ok: false, code: "QA_TEST_CREDENTIALS_ONLY" });
        return;
      }

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
        if (isolatedQa && secretConfig.environment !== "test") {
          json(res, 403, { ok: false, code: "QA_TEST_CREDENTIALS_ONLY" });
          return;
        }
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
              _message: `Credencial validada. Boleto: ${result.boletoAvailable ? "listado" : "não listado"}. PIX: disponibilidade não comprovada por esta consulta; exige order de teste.`,
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
        if (isolatedQa) {
          const connection = await getMunicipalPaymentSecretAdmin(req, municipalityId);
          if (connection.provider !== "mercado_pago" || connection.environment !== "test") {
            json(res, 403, { ok: false, code: "QA_TEST_CREDENTIALS_ONLY" });
            return;
          }
        }
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
      if (isolatedQa) {
        if (!/^Bearer\s+\S+$/i.test(String(req.headers?.authorization || ""))) {
          json(res, 401, { ok: false, code: "QA_AUTH_REQUIRED" }); return;
        }
        const id = municipalityIdFrom(body);
        const guide = await readStoredGuide(req, id, guideCode);
        if (!guide) {
          json(res, 403, { ok: false, code: "QA_CANONICAL_GUIDE_REQUIRED" }); return;
        }
        const resolved = await resolveMercadoPagoMunicipalAccessToken(req, id);
        if (resolved.environment !== "test") {
          json(res, 403, { ok: false, code: "QA_TEST_CREDENTIALS_ONLY" }); return;
        }
      }
      if (isolatedQa) {
        // A PIX reservation is a financial lock; never issue a parallel boleto.
        const pix = await callDataApiRpc<Record<string,unknown>|null>(
          req, "qa_mp_pix_get_v1", {
            _municipality_id: municipalityIdFrom(body),
            _guide_code: guideCode,
          },
        );
        if (!pix.ok) {
          json(res, 503, {ok:false,code:"QA_PIX_RESERVATION_CHECK_FAILED"}); return;
        }
        if (pix.payload) {
          json(res, 409, {ok:false,code:"QA_PIX_ALREADY_RESERVED",
            error:"Guia possui uma reserva PIX de teste. Outra cobrança não será emitida."}); return;
        }
      }
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

      // createMercadoPagoGuideBoleto already persisted this charge through
      // persistGuideCharge / persist_payment_guide_provider_charge_v2,
      // scoped to the exact municipality, immutable guide and amount.
      // Never call the legacy unscoped-by-municipality RPC a second time.

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
