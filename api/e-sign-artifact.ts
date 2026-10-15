import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  callDataApiRpc,
  readBearer,
  readEnv,
  type ApiReq,
} from "../server/municipal-storage";

type Res = import("http").ServerResponse;

const VALIDATED_NEON_AUTH_URL =
  "https://ep-blue-cloud-b4hhgb4t.neonauth.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/auth";

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
    error: normalizeErrorMessage(error) || fallback,
    stage,
    code,
  });
}

async function readJsonBody(req: ApiReq) {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
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
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
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

  const derived = `${forwardedProto === "http" ? "http" : "https"}://${host}`;
  if (!originHeader) return derived;

  try {
    const origin = new URL(originHeader);
    return origin.host.toLowerCase() === host ? origin.origin : "";
  } catch {
    return "";
  }
}

function getNeonAuthUrl() {
  return (
    readEnv("NEON_AUTH_URL") ||
    readEnv("VITE_NEON_AUTH_URL") ||
    VALIDATED_NEON_AUTH_URL
  ).replace(/\/+$/, "");
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
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

async function reauthenticateWithPassword(email: string, password: string, origin: string) {
  const response = await fetch(`${getNeonAuthUrl()}/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: origin,
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    identity: findReauthenticatedIdentity(payload),
    error: normalizeErrorMessage(payload),
  };
}

export default async function handler(req: ApiReq, res: Res) {
  if (req.method === "GET") {
    json(res, 200, {
      ok: true,
      service: "sigapro-electronic-signature",
      version: 1,
    });
    return;
  }

  if (req.method !== "POST") {
    fail(res, 405, "request", "METHOD_NOT_ALLOWED", null, "Método não permitido.");
    return;
  }

  try {
    if (!readBearer(req)) {
      fail(res, 401, "session", "SESSION_EXPIRED", null, "Sua sessão expirou. Entre novamente para assinar.");
      return;
    }

    const origin = normalizeOrigin(req);
    if (!origin) {
      fail(res, 403, "origin", "ORIGIN_NOT_ALLOWED", null, "Origem não autorizada para assinatura eletrônica.");
      return;
    }

    const body = await readJsonBody(req);
    const processId = typeof body.processId === "string" ? body.processId.trim() : "";
    const artifactType = typeof body.artifactType === "string" ? body.artifactType.trim() : "";
    const artifactKey = typeof body.artifactKey === "string" ? body.artifactKey.trim() : "";
    const signerSlot = typeof body.signerSlot === "string" ? body.signerSlot.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const payload = body.payload;

    if (!/^[0-9a-f-]{36}$/i.test(processId)) {
      json(res, 400, { error: "Processo inválido para assinatura." });
      return;
    }
    if (!artifactType || !artifactKey || !signerSlot) {
      json(res, 400, { error: "Etapa de assinatura inválida." });
      return;
    }
    if (!password || password.length > 512) {
      json(res, 400, { error: "Informe sua senha de acesso para confirmar a assinatura." });
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      json(res, 400, { error: "Conteúdo da ficha inválido para assinatura." });
      return;
    }

    const contextResult = await callDataApiRpc<ArtifactContext>(
      req,
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

    const authOrigin =
      readEnv("E_SIGNATURE_AUTH_ORIGIN") ||
      "https://sigapromunicipal.com.br";
    const reauth = await reauthenticateWithPassword(email, password, authOrigin);
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

    const secret = readEnv("E_SIGNATURE_SERVER_SECRET");
    if (secret.length < 32) {
      fail(res, 503, "proof", "SIGNATURE_SECRET_MISSING", null, "Assinatura eletrônica ainda não foi habilitada neste ambiente.");
      return;
    }

    const epoch = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(24).toString("base64url");
    const ip = extractClientIp(req);
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 1000);
    const userAgentHash = createHash("sha256").update(userAgent, "utf8").digest("hex");

    const canonicalProof = [
      authSubject,
      processId,
      artifactType.toLowerCase(),
      artifactKey.toLowerCase(),
      artifactHash,
      signerSlot.toLowerCase(),
      String(epoch),
      nonce,
      ip,
      userAgentHash,
    ].join("|");

    const proofKey = createHash("sha256").update(secret, "utf8").digest("hex");
    const proof = createHmac("sha256", proofKey).update(canonicalProof, "utf8").digest("hex");

    const signResult = await callDataApiRpc<Record<string, unknown>>(
      req,
      "sign_process_artifact_v1",
      {
        _process_id: processId,
        _artifact_type: artifactType,
        _artifact_key: artifactKey,
        _artifact_hash: artifactHash,
        _artifact_payload: payload,
        _signer_slot: signerSlot,
        _server_proof: proof,
        _nonce: nonce,
        _reauthenticated_at_epoch: epoch,
        _ip: ip,
        _user_agent: userAgent,
        _auth_method: "password_reauth",
      },
    );

    if (!signResult.ok) {
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
