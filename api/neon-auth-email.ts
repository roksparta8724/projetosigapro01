import crypto from "node:crypto";

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

export const config = {
  api: {
    bodyParser: false,
  },
};

const DEFAULT_NEON_AUTH_BASE_URL =
  "https://ep-blue-cloud-b4hhgb4t.neonauth.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/auth";

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readRawBody(req: Req) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function firstHeader(req: Req, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value || "";
}

async function verifyNeonWebhook(rawBody: string, req: Req) {
  const signature = firstHeader(req, "x-neon-signature");
  const kid = firstHeader(req, "x-neon-signature-kid");
  const timestamp = firstHeader(req, "x-neon-timestamp");

  if (!signature || !kid || !timestamp) {
    throw new Error("Missing required Neon webhook headers");
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) {
    throw new Error("Invalid Neon webhook timestamp");
  }

  const ageMs = Math.abs(Date.now() - timestampNumber);
  if (ageMs > 5 * 60 * 1000) {
    throw new Error("Neon webhook timestamp outside allowed window");
  }

  const baseUrl = (readEnv("NEON_AUTH_BASE_URL") || DEFAULT_NEON_AUTH_BASE_URL).replace(//+$/, "");
  const jwksResponse = await fetch(`${baseUrl}/.well-known/jwks.json`);
  if (!jwksResponse.ok) {
    throw new Error("Could not fetch Neon JWKS");
  }

  const jwks = (await jwksResponse.json()) as { keys?: Array<Record<string, unknown> & { kid?: string }> };
  const jwk = jwks.keys?.find((key) => key.kid === kid);
  if (!jwk) {
    throw new Error("Neon webhook signing key not found");
  }

  const [headerB64, emptyPayload, signatureB64] = signature.split(".");
  if (!headerB64 || emptyPayload !== "" || !signatureB64) {
    throw new Error("Invalid Neon webhook signature format");
  }

  const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKeyInput, format: "jwk" });
  const payloadB64 = Buffer.from(rawBody, "utf8").toString("base64url");
  const signaturePayload = `${timestamp}.${payloadB64}`;
  const signaturePayloadB64 = Buffer.from(signaturePayload, "utf8").toString("base64url");
  const signingInput = `${headerB64}.${signaturePayloadB64}`;

  const valid = crypto.verify(
    null,
    Buffer.from(signingInput),
    publicKey,
    Buffer.from(signatureB64, "base64url"),
  );

  if (!valid) {
    throw new Error("Invalid Neon webhook signature");
  }

  return JSON.parse(rawBody) as NeonEmailWebhook;
}

type NeonEmailWebhook = {
  event_id?: string;
  event_type?: "send.otp" | "send.magic_link" | string;
  timestamp?: string;
  context?: {
    endpoint_id?: string;
    project_name?: string;
  };
  user?: {
    name?: string | null;
    email?: string | null;
  };
  event_data?: {
    otp_code?: string;
    otp_type?: string;
    link_type?: string;
    link_url?: string;
    token?: string;
    expires_at?: string;
  };
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatExpiration(expiresAt?: string) {
  if (!expiresAt) return "Este link é temporário por segurança.";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "Este link é temporário por segurança.";
  return `Este link é válido até ${new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date)}.`;
}

function brandedEmail(params: {
  title: string;
  intro: string;
  actionLabel?: string;
  actionUrl?: string;
  code?: string;
  recipientName?: string;
  expiresAt?: string;
}) {
  const safeTitle = escapeHtml(params.title);
  const safeIntro = escapeHtml(params.intro);
  const safeName = escapeHtml(params.recipientName || "usuário");
  const safeActionLabel = escapeHtml(params.actionLabel || "");
  const safeActionUrl = params.actionUrl ? escapeHtml(params.actionUrl) : "";
  const safeCode = params.code ? escapeHtml(params.code) : "";
  const expiration = escapeHtml(formatExpiration(params.expiresAt));

  const action = safeActionUrl
    ? `<div style="margin:28px 0;text-align:center"><a href="${safeActionUrl}" style="display:inline-block;background:#0f2742;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">${safeActionLabel}</a></div>`
    : safeCode
      ? `<div style="margin:28px 0;text-align:center"><div style="display:inline-block;font-size:30px;letter-spacing:8px;font-weight:800;color:#0f2742;background:#eef4f8;padding:16px 22px;border-radius:12px">${safeCode}</div></div>`
      : "";

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fa;padding:32px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
            <tr>
              <td style="background:#0b1d30;padding:24px 32px;color:#ffffff">
                <div style="font-size:24px;font-weight:800;letter-spacing:.3px">SIGAPRO Municipal</div>
                <div style="margin-top:6px;font-size:13px;color:#cbd5e1">Sistema Integrado de Gestão e Aprovação de Projetos</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px">
                <div style="font-size:14px;color:#64748b;margin-bottom:12px">Olá, ${safeName}.</div>
                <h1 style="margin:0 0 16px;font-size:25px;line-height:1.25;color:#0f172a">${safeTitle}</h1>
                <p style="font-size:16px;line-height:1.7;margin:0;color:#334155">${safeIntro}</p>
                ${action}
                <p style="font-size:13px;line-height:1.6;color:#64748b;margin:24px 0 0">${expiration}</p>
                <p style="font-size:13px;line-height:1.6;color:#64748b;margin:8px 0 0">Se você não fez esta solicitação, ignore este e-mail. Sua conta continuará protegida.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#64748b">
                Mensagem automática do SIGAPRO Municipal. Por segurança, nunca solicitamos sua senha atual por e-mail.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "SIGAPRO Municipal",
    "",
    `Olá, ${params.recipientName || "usuário"}.`,
    params.title,
    params.intro,
    params.actionUrl ? `${params.actionLabel}: ${params.actionUrl}` : "",
    params.code ? `Código: ${params.code}` : "",
    formatExpiration(params.expiresAt),
    "Se você não fez esta solicitação, ignore este e-mail.",
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}

async function sendWithResend(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = readEnv("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "SIGAPRO Municipal <naoresponda@sigapromunicipal.com.br>",
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend delivery failed (${response.status}): ${body.slice(0, 300)}`);
  }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    if (!rawBody) {
      json(res, 400, { error: "Empty body" });
      return;
    }

    const payload = await verifyNeonWebhook(rawBody, req);
    const email = payload.user?.email?.trim().toLowerCase();
    if (!email) {
      json(res, 400, { error: "Missing recipient" });
      return;
    }

    const recipientName = payload.user?.name || "usuário";
    const eventData = payload.event_data || {};

    if (payload.event_type === "send.magic_link") {
      const link = eventData.link_url;
      if (!link) {
        json(res, 400, { error: "Missing magic link URL" });
        return;
      }

      const isPasswordReset = eventData.link_type === "forget-password";
      const isVerification = eventData.link_type === "email-verification";

      const subject = isPasswordReset
        ? "Redefinição de senha – SIGAPRO Municipal"
        : isVerification
          ? "Confirme seu e-mail – SIGAPRO Municipal"
          : "Seu acesso seguro – SIGAPRO Municipal";

      const emailContent = brandedEmail({
        title: isPasswordReset
          ? "Redefina sua senha com segurança"
          : isVerification
            ? "Confirme seu endereço de e-mail"
            : "Acesse o SIGAPRO Municipal",
        intro: isPasswordReset
          ? "Recebemos uma solicitação para redefinir a senha da sua conta. Use o botão abaixo para criar uma nova senha."
          : isVerification
            ? "Use o botão abaixo para confirmar seu endereço de e-mail e concluir a validação da conta."
            : "Use o botão abaixo para concluir seu acesso seguro ao SIGAPRO Municipal.",
        actionLabel: isPasswordReset
          ? "Redefinir minha senha"
          : isVerification
            ? "Confirmar meu e-mail"
            : "Acessar SIGAPRO",
        actionUrl: link,
        recipientName,
        expiresAt: eventData.expires_at,
      });

      await sendWithResend({
        to: email,
        subject,
        ...emailContent,
      });

      json(res, 200, { success: true });
      return;
    }

    if (payload.event_type === "send.otp") {
      const code = eventData.otp_code;
      if (!code) {
        json(res, 400, { error: "Missing OTP code" });
        return;
      }

      const isPasswordReset = eventData.otp_type === "forget-password";
      const isVerification = eventData.otp_type === "email-verification";

      const subject = isPasswordReset
        ? "Código para redefinir sua senha – SIGAPRO Municipal"
        : isVerification
          ? "Código de confirmação – SIGAPRO Municipal"
          : "Seu código de acesso – SIGAPRO Municipal";

      const emailContent = brandedEmail({
        title: isPasswordReset
          ? "Código para redefinição de senha"
          : isVerification
            ? "Confirme seu endereço de e-mail"
            : "Seu código de acesso",
        intro: isPasswordReset
          ? "Use o código abaixo para continuar a redefinição da sua senha."
          : isVerification
            ? "Use o código abaixo para confirmar seu endereço de e-mail."
            : "Use o código abaixo para concluir seu acesso ao SIGAPRO Municipal.",
        code,
        recipientName,
        expiresAt: eventData.expires_at,
      });

      await sendWithResend({
        to: email,
        subject,
        ...emailContent,
      });

      json(res, 200, { success: true });
      return;
    }

    json(res, 200, { success: true, ignored: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error("[Neon Auth Email Webhook]", message);
    json(res, 401, { error: "Invalid or failed webhook request" });
  }
}
