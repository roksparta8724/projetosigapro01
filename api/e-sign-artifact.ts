import { createHash, randomBytes } from "node:crypto";

type ApiReq = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

const VALIDATED_NEON_AUTH_URL =
  "https://ep-blue-cloud-b4hhgb4t.neonauth.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/auth";
const VALIDATED_NEON_DATA_API_URL =
  "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";

// Somente o hash SHA-256 fica no código/banco. A chave real permanece exclusivamente no Vercel.
const EXPECTED_SIGNATURE_SECRET_HASH =
  "b90c8fd07d7b6232b4043961d8b9cb65e289628ce7b6b759fc7997d93c0533cd";

type ArtifactContext = {
  auth_subject?: string;
  profile_id?: string;
  user_id?: string;
  email?: string;
  name?: string;
  role?: string;
  title?: string;
  registration?: string | null;
  signer_slot?: string;
  process_id?: string;
  tenant_id?: string;
  municipality_id?: string | null;
};

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function readBearer(req: ApiReq) {
  const raw = String(req.headers.authorization || "");
  return /^Bearer\s+(.+)$/i.exec(raw)?.[1]?.trim() || "";
}

function getDataApiUrl() {
  return (
    readEnv("R2_AUTH_DATA_API_URL") ||
    readEnv("VITE_NEON_DATA_API_URL") ||
    VALIDATED_NEON_DATA_API_URL
  ).replace(/\/+$/, "");
}

function getNeonAuthUrl() {
  return (
    readEnv("NEON_AUTH_URL") ||
    readEnv("VITE_NEON_AUTH_URL") ||
    VALIDATED_NEON_AUTH_URL
  ).replace(/\/+$/, "");
}

function normalizeErrorMessage(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["message", "error_description", "detail", "details", "hint", "code"]) {
    const nested = normalizeErrorMessage(record[key]);
    if (nested) return nested;
  }
  return normalizeErrorMessage(record.error);
}

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function fail(
  res: Res,
  status: number,
  stage: string,
  code: string,
  error: unknown,
  fallback: string,
) {
  json(res, status, {
    ok: false,
    error: normalizeErrorMessage(error) || fallback,
    stage,
    code,
  });
}

async function readJsonBody(req: ApiReq) {
  if (req.body && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      throw new Error("Requisição inválida.");
    }
  }

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk) => {
      const part = Buffer.from(chunk);
      total += part.length;
      if (total > 512 * 1024) {
        reject(new Error("Corpo da requisição excede o limite."));
        return;
      }
      chunks.push(part);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Requisição inválida."));
      }
    });

    req.on("error", reject);
  });
}

function normalizeOrigin(req: ApiReq) {
  const host = String(req.headers.host || "").trim().toLowerCase();
  const originHeader = String(req.headers.origin || "").trim();

  const allowedHost =
    host === "sigapromunicipal.com.br" ||
    host === "www.sigapromunicipal.com.br" ||
    host.endsWith(".sigapromunicipal.com.br") ||
    host.endsWith(".vercel.app") ||
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:");

  if (!host || !allowedHost) return "";

  if (!originHeader) return "https://sigapromunicipal.com.br";

  try {
    const origin = new URL(originHeader);
    const originHost = origin.host.toLowerCase();
    const allowedOrigin =
      originHost === host ||
      originHost === "sigapromunicipal.com.br" ||
      originHost === "www.sigapromunicipal.com.br" ||
      originHost.endsWith(".sigapromunicipal.com.br") ||
      originHost.startsWith("localhost:") ||
      originHost.startsWith("127.0.0.1:");

    return allowedOrigin ? origin.origin : "";
  } catch {
    return "";
  }
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function extractClientIp(req: ApiReq) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const real = String(req.headers["x-real-ip"] || "").trim();
  return forwarded || real || req.socket?.remoteAddress || "";
}

function findReauthenticatedIdentity(payload: unknown) {
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = source.data && typeof source.data === "object" ? (source.data as Record<string, unknown>) : {};
  const session = source.session && typeof source.session === "object" ? (source.session as Record<string, unknown>) : {};
  const directUser = source.user && typeof source.user === "object" ? (source.user as Record<string, unknown>) : null;
  const dataUser = data.user && typeof data.user === "object" ? (data.user as Record<string, unknown>) : null;
  const sessionUser = session.user && typeof session.user === "object" ? (session.user as Record<string, unknown>) : null;
  const user = directUser || dataUser || sessionUser || {};

  return {
    id: String(user.id || source.userId || data.userId || "").trim(),
    email: String(user.email || source.email || data.email || "").trim().toLowerCase(),
  };
}

async function callDataApiRpc<T>(
  bearer: string,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; payload: T | null; error: string }> {
  try {
    const response = await fetch(`${getDataApiUrl()}/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      cache: "no-store",
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      payload: payload as T | null,
      error: normalizeErrorMessage(payload) || (!response.ok ? raw.slice(0, 500) : ""),
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      payload: null,
      error: error instanceof Error ? error.message : "Neon Data API indisponível.",
    };
  }
}

async function reauthenticateWithPassword(email: string, password: string) {
  try {
    const response = await fetch(`${getNeonAuthUrl()}/sign-in/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: readEnv("E_SIGNATURE_AUTH_ORIGIN") || "https://sigapromunicipal.com.br",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify({
        email,
        password,
        rememberMe: false,
      }),
    });

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      identity: findReauthenticatedIdentity(payload),
      error: normalizeErrorMessage(payload) || (!response.ok ? raw.slice(0, 500) : ""),
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      identity: { id: "", email: "" },
      error: error instanceof Error ? error.message : "Neon Auth indisponível.",
    };
  }
}

function validateServerSecret() {
  const secret = readEnv("E_SIGNATURE_SERVER_SECRET");
  if (secret.length < 32) {
    return { ok: false as const, secret: "", error: "Chave de assinatura ausente." };
  }

  const fingerprint = createHash("sha256").update(secret, "utf8").digest("hex");
  if (fingerprint !== EXPECTED_SIGNATURE_SECRET_HASH) {
    return { ok: false as const, secret: "", error: "Chave de assinatura fora de sincronismo." };
  }

  return { ok: true as const, secret, error: "" };
}

export default async function handler(req: ApiReq, res: Res) {
  if (req.method === "GET") {
    const serverSecret = validateServerSecret();
    json(res, serverSecret.ok ? 200 : 503, {
      ok: serverSecret.ok,
      service: "sigapro-electronic-signature",
      version: 2,
      checks: {
        serverKey: serverSecret.ok,
        neonAuth: Boolean(getNeonAuthUrl()),
        neonDataApi: Boolean(getDataApiUrl()),
      },
    });
    return;
  }

  if (req.method !== "POST") {
    fail(res, 405, "request", "METHOD_NOT_ALLOWED", null, "Método não permitido.");
    return;
  }

  const requestId = randomBytes(9).toString("base64url");

  try {
    const bearer = readBearer(req);
    if (!bearer) {
      fail(res, 401, "session", "SESSION_EXPIRED", null, "Sua sessão expirou. Entre novamente para assinar.");
      return;
    }

    if (!normalizeOrigin(req)) {
      fail(res, 403, "origin", "ORIGIN_NOT_ALLOWED", null, "Origem não autorizada para assinatura eletrônica.");
      return;
    }

    const serverSecret = validateServerSecret();
    if (!serverSecret.ok) {
      fail(res, 503, "configuration", "SIGNATURE_KEY_MISMATCH", serverSecret.error, "Serviço de assinatura não configurado.");
      return;
    }

    const body = await readJsonBody(req);
    const processId = typeof body.processId === "string" ? body.processId.trim() : "";
    const artifactType = typeof body.artifactType === "string" ? body.artifactType.trim().toLowerCase() : "";
    const artifactKey = typeof body.artifactKey === "string" ? body.artifactKey.trim().toLowerCase() : "";
    const signerSlot = typeof body.signerSlot === "string" ? body.signerSlot.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const payload = body.payload;

    if (!/^[0-9a-f-]{36}$/i.test(processId)) {
      fail(res, 400, "request", "PROCESS_INVALID", null, "Processo inválido para assinatura.");
      return;
    }

    if (!artifactType || !artifactKey || !signerSlot) {
      fail(res, 400, "request", "SIGNATURE_STEP_INVALID", null, "Etapa de assinatura inválida.");
      return;
    }

    if (!password || password.length > 512) {
      fail(res, 400, "password", "PASSWORD_REQUIRED", null, "Informe sua senha de acesso para confirmar a assinatura.");
      return;
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      fail(res, 400, "request", "ARTIFACT_INVALID", null, "Conteúdo da ficha inválido para assinatura.");
      return;
    }

    const contextResult = await callDataApiRpc<ArtifactContext>(
      bearer,
      "get_process_artifact_signature_context_v1",
      { _process_id: processId, _signer_slot: signerSlot },
    );

    if (!contextResult.ok || !contextResult.payload) {
      fail(
        res,
        contextResult.status || 403,
        "authorization",
        "SIGNER_CONTEXT_DENIED",
        contextResult.error,
        "Não foi possível validar sua atribuição para assinar.",
      );
      return;
    }

    const context = contextResult.payload;
    const email = String(context.email || "").trim().toLowerCase();
    const authSubject = String(context.auth_subject || "").trim();

    if (!email || !authSubject) {
      fail(res, 403, "identity", "SIGNER_IDENTITY_INVALID", null, "A conta atual não possui identidade válida para assinatura.");
      return;
    }

    const reauth = await reauthenticateWithPassword(email, password);

    if (!reauth.ok) {
      if (reauth.status === 400 || reauth.status === 401 || reauth.status === 403) {
        fail(res, 401, "password", "PASSWORD_REAUTH_FAILED", null, "Senha de acesso incorreta. A assinatura não foi realizada.");
      } else {
        fail(
          res,
          503,
          "password",
          "AUTH_SERVICE_UNAVAILABLE",
          reauth.error,
          "O serviço de autenticação não respondeu corretamente. Tente novamente.",
        );
      }
      return;
    }

    const identityMatches =
      (reauth.identity.id && reauth.identity.id === authSubject) ||
      (reauth.identity.email && reauth.identity.email === email);

    if (!identityMatches) {
      fail(res, 403, "identity", "PASSWORD_IDENTITY_MISMATCH", null, "A senha confirmada não pertence ao usuário desta sessão.");
      return;
    }

    const canonicalPayload = stableStringify(payload);
    const artifactHash = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
    const epoch = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(24).toString("base64url");
    const ip = extractClientIp(req);
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 1000);

    const signResult = await callDataApiRpc<Record<string, unknown>>(
      bearer,
      "sign_process_artifact_v2",
      {
        _process_id: processId,
        _artifact_type: artifactType,
        _artifact_key: artifactKey,
        _artifact_hash: artifactHash,
        _artifact_payload: payload,
        _signer_slot: signerSlot,
        _server_secret: serverSecret.secret,
        _nonce: nonce,
        _reauthenticated_at_epoch: epoch,
        _ip: ip,
        _user_agent: userAgent,
        _auth_method: "password_reauth",
      },
    );

    if (!signResult.ok || !signResult.payload) {
      const message = signResult.error || "Não foi possível concluir a assinatura eletrônica.";
      fail(
        res,
        /já assinou|já possui/i.test(message) ? 409 : signResult.status || 400,
        "database",
        /já assinou|já possui/i.test(message) ? "SIGNATURE_ALREADY_EXISTS" : "SIGNATURE_RPC_FAILED",
        message,
        "Não foi possível concluir a assinatura eletrônica.",
      );
      return;
    }

    json(res, 200, {
      ok: true,
      requestId,
      signature: signResult.payload,
      artifact: {
        type: artifactType,
        key: artifactKey,
        hash: artifactHash,
      },
    });
  } catch (error) {
    fail(
      res,
      500,
      "server",
      "SIGNATURE_SERVER_ERROR",
      error,
      "Falha ao realizar a assinatura eletrônica.",
    );
  }
}
