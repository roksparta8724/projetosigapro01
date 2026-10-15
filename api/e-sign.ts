import { createHash, createHmac, randomBytes } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  callDataApiRpc,
  readBearer,
  readEnv,
  type ApiReq,
  resolveMunicipalDocumentTarget,
} from "../server/municipal-storage";

type Res = import("http").ServerResponse;

const VALIDATED_NEON_AUTH_URL =
  "https://ep-blue-cloud-b4hhgb4t.neonauth.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/auth";

type SignatureContext = {
  auth_subject?: string;
  profile_id?: string;
  email?: string;
  name?: string;
  role?: string;
  title?: string;
  registration?: string | null;
  process_id?: string;
  municipality_id?: string;
  document_id?: string;
  document_title?: string;
  file_path?: string;
  document_hash?: string;
  document_version?: number;
};

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: ApiReq) {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk) => {
      const part = Buffer.from(chunk);
      total += part.length;
      if (total > 32 * 1024) {
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

function resolveR2Endpoint() {
  const accountId = readEnv("R2_ACCOUNT_ID")
    .replace(/^https?:\/\//i, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, "")
    .replace(/[^a-zA-Z0-9]/g, "");

  if (accountId && !/^sua_?account_?id$/i.test(accountId)) {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  const rawEndpoint = readEnv("R2_ENDPOINT");
  if (!rawEndpoint) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return rawEndpoint.replace(/\/+$/, "");
  }
}

async function sha256StoredDocument(req: ApiReq, context: SignatureContext) {
  const objectKey = String(context.file_path || "").trim();
  if (!objectKey) {
    throw new Error("O documento não possui referência válida no armazenamento oficial.");
  }

  const requestedBucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
  const municipalityId = String(context.municipality_id || "").trim();
  const municipalTarget = municipalityId
    ? await resolveMunicipalDocumentTarget(req, municipalityId, requestedBucket, objectKey)
    : null;

  let client: S3Client;
  let bucket: string;
  let key: string;

  if (municipalTarget) {
    client = municipalTarget.client;
    bucket = municipalTarget.bucket;
    key = municipalTarget.objectKey;
  } else {
    const endpoint = resolveR2Endpoint();
    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error("Armazenamento oficial indisponível para conferir a integridade do documento.");
    }
    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    bucket = requestedBucket;
    key = objectKey;
  }

  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) {
    throw new Error("Não foi possível ler o conteúdo do documento no armazenamento oficial.");
  }

  const hash = createHash("sha256");
  const stream = object.Body as unknown as AsyncIterable<Uint8Array>;
  if (typeof (stream as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream) {
      hash.update(Buffer.from(chunk));
    }
  } else {
    const body = object.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> };
    if (!body.transformToByteArray) {
      throw new Error("O armazenamento não retornou um fluxo legível para conferência.");
    }
    hash.update(Buffer.from(await body.transformToByteArray()));
  }

  return hash.digest("hex");
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

async function reauthenticateWithPassword(input: {
  email: string;
  password: string;
  origin: string;
}) {
  const response = await fetch(`${getNeonAuthUrl()}/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: input.origin,
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });

  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, identity: findReauthenticatedIdentity(payload) };
}

export default async function handler(req: ApiReq, res: Res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Método não permitido." });
    return;
  }

  try {
    if (!readBearer(req)) {
      json(res, 401, { error: "Sua sessão expirou. Entre novamente para assinar." });
      return;
    }

    const origin = normalizeOrigin(req);
    if (!origin) {
      json(res, 403, { error: "Origem não autorizada para assinatura eletrônica." });
      return;
    }

    const body = await readJsonBody(req);
    const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
      json(res, 400, { error: "Documento inválido para assinatura." });
      return;
    }
    if (!password || password.length > 512) {
      json(res, 400, { error: "Informe sua senha de acesso para confirmar a assinatura." });
      return;
    }

    const contextResult = await callDataApiRpc<SignatureContext>(
      req,
      "get_signature_context_v1",
      { _document_id: documentId },
    );
    if (!contextResult.ok || !contextResult.payload) {
      json(res, contextResult.status || 403, {
        error: contextResult.error || "Não foi possível validar sua permissão para assinar.",
      });
      return;
    }

    const context = contextResult.payload;
    const email = String(context.email || "").trim().toLowerCase();
    const authSubject = String(context.auth_subject || "").trim();
    if (!email || !authSubject) {
      json(res, 403, { error: "A conta atual não possui identidade de autenticação válida." });
      return;
    }

    const reauth = await reauthenticateWithPassword({ email, password, origin });
    // A senha deixa de ser referenciada a partir daqui e nunca é enviada ao PostgreSQL.
    if (!reauth.ok) {
      json(res, 401, { error: "Senha de acesso incorreta. A assinatura não foi realizada." });
      return;
    }

    const identityMatches =
      (reauth.identity.id && reauth.identity.id === authSubject) ||
      (reauth.identity.email && reauth.identity.email === email);
    if (!identityMatches) {
      json(res, 403, { error: "A senha confirmada não pertence ao usuário desta sessão." });
      return;
    }

    const contentHash = await sha256StoredDocument(req, context);

    const secret = readEnv("E_SIGNATURE_SERVER_SECRET");
    if (secret.length < 32) {
      json(res, 503, { error: "Assinatura eletrônica ainda não foi habilitada neste ambiente." });
      return;
    }

    const epoch = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(24).toString("base64url");
    const ip = extractClientIp(req);
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 1000);
    const userAgentHash = createHash("sha256").update(userAgent, "utf8").digest("hex");
    const canonical = [authSubject, documentId, contentHash, String(epoch), nonce, ip, userAgentHash].join("|");
    const proofKey = createHash("sha256").update(secret, "utf8").digest("hex");
    const proof = createHmac("sha256", proofKey).update(canonical, "utf8").digest("hex");

    const signResult = await callDataApiRpc<Record<string, unknown>>(
      req,
      "sign_process_document_v2",
      {
        _document_id: documentId,
        _content_hash: contentHash,
        _server_proof: proof,
        _nonce: nonce,
        _reauthenticated_at_epoch: epoch,
        _ip: ip,
        _user_agent: userAgent,
        _auth_method: "password_reauth",
      },
    );

    if (!signResult.ok) {
      const message = signResult.error || "Não foi possível concluir a assinatura.";
      const duplicate = /já assinou|already/i.test(message);
      json(res, duplicate ? 409 : signResult.status || 400, { error: message });
      return;
    }

    json(res, 200, {
      ok: true,
      signature: signResult.payload,
      document: {
        id: context.document_id,
        title: context.document_title,
        hash: contentHash,
        version: context.document_version,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao realizar a assinatura.";
    json(res, 500, { error: message });
  }
}
