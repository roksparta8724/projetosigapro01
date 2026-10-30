import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type ApiReq = import("http").IncomingMessage & { method?: string; body?: unknown };

const VALIDATED_NEON_DATA_API_URL =
  "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";

export function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

export function readBearer(req: ApiReq) {
  const raw = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1]?.trim() || "";
}

function neonBranchHost(raw: string, kind: "neonauth" | "apirest") {
  try {
    const url = new URL(raw);
    const match = url.hostname.match(/^([^.]+)\.(neonauth|apirest)\./);
    return url.protocol === "https:" && match?.[2] === kind ? match[1] : "";
  } catch { return ""; }
}

export function getDataApiUrl() {
  // The official Vercel deployment also forces the production Neon Auth URL
  // in the browser: server-side RPC must use the SAME branch, regardless of
  // stale inherited variables from previous preview deployments.
  if (process.env.VERCEL_ENV === "production") {
    return VALIDATED_NEON_DATA_API_URL;
  }
  // Vite localhost signs in with the official Neon Auth by default.
  // Do NOT honor an arbitrary Data API override independently: that creates
  // "jwk not found" by sending a production JWT to a QA branch (or vice versa).
  if (process.env.NODE_ENV !== "production") {
    const isolatedRequested = readEnv("VITE_SIGAPRO_NEON_ISOLATED") === "true";
    const localAuth = readEnv("VITE_NEON_AUTH_URL");
    const localData = readEnv("VITE_NEON_DATA_API_URL");
    const authHost = neonBranchHost(localAuth, "neonauth");
    const dataHost = neonBranchHost(localData, "apirest");
    if (isolatedRequested) {
      if (!authHost || authHost !== dataHost) {
        throw new Error("Homologação Neon local inválida: informe Auth e Data API HTTPS da MESMA branch.");
      }
      return localData.replace(/\/+$/, "");
    }
    return VALIDATED_NEON_DATA_API_URL;
  }
  // Production / preview retain their explicitly configured data source.
  return (
    readEnv("R2_AUTH_DATA_API_URL") ||
    readEnv("VITE_NEON_DATA_API_URL") ||
    VALIDATED_NEON_DATA_API_URL
  ).replace(/\/+$/, "");
}

export async function callDataApiRpc<T = unknown>(
  req: ApiReq,
  fn: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; payload: T | null; error: string }> {
  const token = readBearer(req);
  if (!token) {
    return { ok: false, status: 401, payload: null, error: "Autenticação necessária." };
  }

  try {
    const response = await fetch(`${getDataApiUrl()}/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    const error =
      payload && typeof payload === "object" && "message" in (payload as Record<string, unknown>)
        ? String((payload as Record<string, unknown>).message || "")
        : "";
    return { ok: response.ok, status: response.status, payload, error };
  } catch {
    return { ok: false, status: 503, payload: null, error: "Serviço de configuração indisponível." };
  }
}

function encryptionKey() {
  const secret = readEnv("MUNICIPAL_STORAGE_MASTER_KEY");
  if (!secret) {
    throw new Error(
      "A chave mestre MUNICIPAL_STORAGE_MASTER_KEY ainda não foi configurada no ambiente seguro do SIGAPRO.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptStorageCredentials(input: { accessKeyId: string; secretAccessKey: string }) {
  if (!input.accessKeyId.trim() || !input.secretAccessKey.trim()) {
    throw new Error("Informe Access Key e Secret Key do armazenamento municipal.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plain = Buffer.from(JSON.stringify({
    accessKeyId: input.accessKeyId.trim(),
    secretAccessKey: input.secretAccessKey.trim(),
  }), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptStorageCredentials(ciphertext: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = String(ciphertext || "").split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Credencial municipal armazenada em formato inválido.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plain) as { accessKeyId?: string; secretAccessKey?: string };
  if (!parsed.accessKeyId || !parsed.secretAccessKey) {
    throw new Error("Credencial municipal incompleta.");
  }
  return {
    accessKeyId: parsed.accessKeyId,
    secretAccessKey: parsed.secretAccessKey,
  };
}

export function credentialFingerprint(accessKeyId: string) {
  const normalized = accessKeyId.trim();
  if (!normalized) return "";
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 10).toUpperCase();
  const suffix = normalized.slice(-4);
  return `AK…${suffix} · ${digest}`;
}

export function normalizeStorageEndpoint(value: string) {
  const raw = value.trim();
  if (!raw) throw new Error("Informe o endpoint do armazenamento.");
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(candidate);
  if (
    url.protocol !== "https:" &&
    !(readEnv("MUNICIPAL_STORAGE_ALLOW_HTTP").toLowerCase() === "true")
  ) {
    throw new Error("O armazenamento municipal deve usar HTTPS.");
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

export type MunicipalStorageConnection = {
  municipality_id?: string;
  provider?: "sigapro_r2" | "s3_compatible";
  status?: "inactive" | "configured" | "active" | "error";
  endpoint_url?: string;
  region?: string;
  bucket_documents?: string;
  base_path?: string;
  force_path_style?: boolean;
  credentials_configured?: boolean;
  credentials_ciphertext?: string;
  credential_fingerprint?: string;
  last_tested_at?: string | null;
  last_test_status?: string | null;
  last_test_message?: string | null;
  updated_at?: string | null;
};

export async function getMunicipalStorageConnection(req: ApiReq, municipalityId: string) {
  const result = await callDataApiRpc<MunicipalStorageConnection>(
    req,
    "get_municipal_storage_connection_v1",
    { _municipality_id: municipalityId },
  );
  if (!result.ok) {
    throw new Error(result.error || "Não foi possível carregar a configuração de armazenamento.");
  }
  return result.payload || {};
}

export async function getMunicipalStorageSecretAdmin(req: ApiReq, municipalityId: string) {
  const result = await callDataApiRpc<MunicipalStorageConnection>(
    req,
    "get_municipal_storage_secret_admin_v1",
    { _municipality_id: municipalityId },
  );
  if (!result.ok) {
    throw new Error(result.error || "Não foi possível carregar a credencial municipal para teste.");
  }
  return result.payload || {};
}

export async function resolveMunicipalStorageSecret(req: ApiReq, municipalityId: string) {
  const result = await callDataApiRpc<MunicipalStorageConnection>(
    req,
    "resolve_municipal_storage_secret_v1",
    { _municipality_id: municipalityId },
  );
  if (!result.ok) {
    throw new Error(result.error || "Não foi possível resolver o armazenamento municipal.");
  }
  return result.payload || {};
}

export function buildMunicipalS3Client(config: MunicipalStorageConnection) {
  const endpoint = normalizeStorageEndpoint(String(config.endpoint_url || ""));
  const region = String(config.region || "us-east-1").trim() || "us-east-1";
  const credentials = decryptStorageCredentials(String(config.credentials_ciphertext || ""));
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: Boolean(config.force_path_style),
    credentials,
  });
}

export function applyMunicipalBasePath(basePath: string | undefined, objectKey: string) {
  const prefix = String(basePath || "").replace(/^\/+|\/+$/g, "");
  const logical = objectKey.replace(/^\/+/, "");
  return prefix ? `${prefix}/${logical}` : logical;
}

export async function testMunicipalStorageConnection(config: MunicipalStorageConnection) {
  const client = buildMunicipalS3Client(config);
  const bucket = String(config.bucket_documents || "").trim();
  if (!bucket) throw new Error("Bucket de documentos não configurado.");

  const testKey = applyMunicipalBasePath(
    config.base_path,
    `.sigapro/connection-tests/${randomUUID()}.txt`,
  );

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: testKey,
    Body: Buffer.from("SIGAPRO storage connection test", "utf8"),
    ContentType: "text/plain",
  }));

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
  } catch {
    // O teste principal é a gravação. A limpeza pode depender de permissão separada.
  }

  return { ok: true, message: "Conexão validada com gravação no armazenamento da Prefeitura." };
}

function isPublicMunicipalLegislationObject(objectKey: string) {
  return /^municipalities\/[0-9a-f-]{36}\/legislation(?:[-/]|$)/i.test(
    String(objectKey || "").replace(/^\/+/, ""),
  );
}

export async function resolveMunicipalDocumentTarget(
  req: ApiReq,
  municipalityId: string,
  requestedBucket: string,
  logicalObjectKey: string,
) {
  if (!municipalityId) return null;
  const sigaproDocumentBucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
  if (requestedBucket !== sigaproDocumentBucket) return null;

  const publicLegislation = isPublicMunicipalLegislationObject(logicalObjectKey);

  // O acervo legal municipal é público. Se a sessão do navegador ainda não
  // disponibilizou o Bearer para a função, não bloqueamos a leitura tentando
  // resolver um BYOS que nem existe nesta Prefeitura; seguimos para o R2
  // institucional do SIGAPRO. Documentos de processos continuam exigindo a
  // resolução autenticada normal.
  if (publicLegislation && !readBearer(req)) {
    return null;
  }

  let config: MunicipalStorageConnection;
  try {
    config = await resolveMunicipalStorageSecret(req, municipalityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    // Compatibilidade durante o rollout: antes da migration BYOS existir,
    // o comportamento histórico permanece no R2 do SIGAPRO.
    if (
      /resolve_municipal_storage_secret_v1|schema cache|does not exist|not found/i.test(message) ||
      (publicLegislation &&
        /autentica[cç][aã]o necess[aá]ria|jwt|token|servi[cç]o de configura[cç][aã]o indispon[ií]vel/i.test(
          message,
        ))
    ) {
      return null;
    }
    throw error;
  }
  if (config.provider !== "s3_compatible" || config.status !== "active") return null;
  if (!config.credentials_ciphertext || !config.bucket_documents || !config.endpoint_url) {
    throw new Error("O armazenamento próprio da Prefeitura está ativo, mas incompleto.");
  }

  return {
    client: buildMunicipalS3Client(config),
    bucket: String(config.bucket_documents),
    objectKey: applyMunicipalBasePath(config.base_path, logicalObjectKey),
    logicalObjectKey,
    config,
  };
}
