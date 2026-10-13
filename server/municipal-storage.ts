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

export function getDataApiUrl() {
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

export async function resolveMunicipalDocumentTarget(
  req: ApiReq,
  municipalityId: string,
  logicalObjectKey: string,
) {
  if (!municipalityId) return null;
  const config = await resolveMunicipalStorageSecret(req, municipalityId);
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
