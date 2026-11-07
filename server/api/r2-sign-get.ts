import { getR2EndpointCandidates, resolveR2Endpoint } from "../r2-runtime.js";
import { isPublicLegislationPdfKey, isSafeR2ObjectKey, signedR2Ttl } from "../r2-object-key-validation.js";
/**
 * api/r2-sign-get.ts — Vercel Serverless handler
 *
 * Recebe { bucket, objectKey, expiresIn }
 * Retorna { signedUrl, bucket, objectKey }
 * usando S3 presigned GET URL via @aws-sdk/s3-request-presigner.
 */

import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { callDataApiRpc, getDataApiUrl, readBearer, resolveMunicipalDocumentTarget } from "../municipal-storage.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function extractMunicipalityId(objectKey: string) {
  const match = /^municipalities\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\//i.exec(objectKey);
  return match?.[1] || "";
}

function resolveRequestedBucket(value: string) {
  const logos = readEnv("R2_BUCKET_LOGOS") || "sigapro-logos";
  const documents = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";

  if (value === "process-documents") return documents;
  if (value === "institutional-branding" || value === "profile-assets") return logos;
  if (value === documents || value === logos) return value;
  return "";
}

/**
 * Pure secondary guard: SELECT under RLS and the document RPC are necessary
 * but neither validates this exact object key, nor rejects a revoked revision.
 * Only a current document belonging to its path's municipality can be signed.
 */
export type PrivateR2DocumentRow = {
  id?: unknown;
  process_id?: unknown;
  municipality_id?: unknown;
  tenant_id?: unknown;
  file_path?: unknown;
  version?: unknown;
  is_valid?: unknown;
  invalidated_at?: unknown;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isEligiblePrivateR2Document(
  record: PrivateR2DocumentRow | null | undefined,
  objectKey: string,
  keyMunicipalityId: string,
): boolean {
  if (!record || !isSafeR2ObjectKey(objectKey) ||
      !UUID.test(keyMunicipalityId) ||
      !UUID.test(String(record.id || "")) ||
      !UUID.test(String(record.process_id || "")) ||
      record.file_path !== objectKey ||
      record.is_valid !== true || record.invalidated_at !== null ||
      !Number.isSafeInteger(record.version) || Number(record.version) < 1) return false;
  const tenant = String(record.tenant_id || "").toLowerCase();
  const municipality = record.municipality_id == null ? tenant :
    String(record.municipality_id).toLowerCase();
  return tenant === keyMunicipalityId.toLowerCase() &&
    municipality === tenant;
}

/**
 * A signed R2 URL is a temporary bearer credential for the file.
 * Before generating it, require the same row-level SELECT permission used by
 * the process-document viewer. Never trust a municipality or object key supplied
 * by the browser as proof of authorization.
 */
export async function authorizePrivateR2DocumentRead(
  req: Req,
  objectKey: string,
  keyMunicipalityId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = readBearer(req);
  if (!token) return { ok: false, status: 401, error: "Autenticação necessária para abrir documento." };
  try {
    const query = new URLSearchParams({
      file_path: `eq.${objectKey}`,
      select: "id,process_id,municipality_id,tenant_id,file_path,version,is_valid,invalidated_at",
      limit: "2",
    });
    const result = await fetch(`${getDataApiUrl()}/process_documents?${query.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
    });
    if (!result.ok) {
      return {
        ok: false,
        status: result.status === 401 ? 401 : result.status >= 500 ? 503 : 403,
        error: "Não foi possível confirmar a autorização do documento.",
      };
    }
    const rows: unknown = await result.json();
    // Duplicate keys are ambiguous and may refer to a revoked version.
    // Never choose the first row and silently sign the other one.
    const document = Array.isArray(rows) && rows.length === 1
      ? rows[0] as PrivateR2DocumentRow | undefined : undefined;
    if (!isEligiblePrivateR2Document(document, objectKey, keyMunicipalityId))
      return { ok: false, status: 403, error: "Documento vigente não disponível para esta conta." };
    const documentId = String(document?.id);
    const release = await callDataApiRpc<boolean>(req, "authorize_technical_document_signing_v1", {
      _document_id: documentId,
    });
    if (!release.ok) {
      return {
        ok: false,
        status: release.status === 401 ? 401 : release.status >= 500 ? 503 : 403,
        error: "Não foi possível confirmar a autorização técnica do documento.",
      };
    }
    if (release.payload !== true) {
      return { ok: false, status: 403, error: "Documento ainda não liberado para consulta técnica." };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: "Validação de acesso ao documento temporariamente indisponível." };
  }
}

/** Authorization for a presigned identity asset; URLs are bearer credentials. */
export async function authorizeR2LogoRead(req: Req, key: string) {
  // Logos are public; private avatars and other objects are not.
  const publicBrand =
    /^platform\/branding\/[a-zA-Z0-9/_-]+\.(?:png|webp|jpe?g)$/i.test(key) ||
    /^municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/branding\/[a-zA-Z0-9/_ .()-]+\.(?:png|webp|jpe?g)$/i.test(key);
  if (publicBrand && !key.includes("..")) return { ok: true as const };
  const tenant = extractMunicipalityId(key);
  const result = await callDataApiRpc(req, tenant ? "has_tenant_access" : "is_master",
    tenant ? { target_tenant: tenant } : {});
  if (!result.ok || result.payload !== true)
    return { ok: false as const, status: result.status === 401 ? 401 : 403,
      error: "Sem permissão para acessar este arquivo." };
  return { ok: true as const };
}

function setCors(res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res: Res, status: number, body: unknown) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

const MAX_SIGN_REQUEST_BYTES = 4096;
async function readJsonBody(req: Req): Promise<Record<string, unknown>> {
  const validate = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("R2_BODY_INVALID");
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_SIGN_REQUEST_BYTES)
      throw new Error("R2_BODY_LIMIT");
    return value as Record<string, unknown>;
  };
  if (req.body !== undefined) return validate(req.body);
  const chunks: Buffer[] = []; let count = 0;
  for await (const chunk of req) {
    const data = Buffer.from(chunk);
    count += data.length;
    if (count > MAX_SIGN_REQUEST_BYTES) throw new Error("R2_BODY_LIMIT");
    chunks.push(data);
  }
  try { return validate(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
  catch (error) {
    if (error instanceof Error && error.message === "R2_BODY_LIMIT") throw error;
    throw new Error("R2_BODY_INVALID");
  }
}

/** Provider errors never become user-visible stack traces, URLs or secrets. */
export function classifyR2SignFailure(error: unknown) {
  const e = error as { name?: unknown; message?: unknown; $metadata?: { httpStatusCode?: number } } | null;
  const name = String(e?.name || "");
  const message = typeof e?.message === "string" ? e.message : "";
  const status = e?.$metadata?.httpStatusCode;
  if (/^R2_BODY_LIMIT$/.test(message)) return { status: 413, code: "R2_REQUEST_TOO_LARGE",
    error: "Solicitação de acesso ao arquivo acima do limite permitido." };
  if (/^R2_BODY_INVALID$/.test(message)) return { status: 400, code: "R2_REQUEST_INVALID",
    error: "Dados do pedido de arquivo inválidos." };
  if (/^R2_ENV_MISSING$/.test(message)) return { status: 503, code: "R2_CONFIG_UNAVAILABLE",
    error: "Armazenamento municipal não configurado neste ambiente." };
  if (status === 404 || /^(?:NoSuchKey|NotFound|NoSuchBucket)$/.test(name))
    return { status: 404, code: "R2_OBJECT_NOT_FOUND",
      error: "Arquivo não encontrado no armazenamento vinculado à Prefeitura." };
  if (/SignatureDoesNotMatch|InvalidAccessKeyId|AccessDenied/i.test(name) ||
      /signature.*does not match|invalid access key/i.test(message) || status === 403)
    return { status: 503, code: "R2_STORAGE_AUTH_FAILED",
      error: "O armazenamento não confirmou as credenciais de acesso. Nenhum link foi emitido." };
  return { status: 503, code: "R2_UNAVAILABLE",
    error: "O armazenamento não respondeu corretamente. Tente novamente sem criar uma nova guia ou documento." };
}

export default async function handler(req: Req, res: Res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Método não permitido" });
    return;
  }

  try {
    const endpoint = resolveR2Endpoint();
    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    const envOk = Boolean(endpoint && accessKeyId && secretAccessKey);

    const body = (await readJsonBody(req)) as {
      bucket?: unknown;
      objectKey?: unknown;
      expiresIn?: unknown;
    };

    const { bucket: requestedBucket, objectKey, expiresIn } = body ?? {};
    const bucket =
      typeof requestedBucket === "string"
        ? resolveRequestedBucket(requestedBucket)
        : "";

    if (!bucket) {
      json(res, 400, { error: "Bucket inválido." });
      return;
    }

    if (!isSafeR2ObjectKey(objectKey)) {
      json(res, 400, { error: "Chave do objeto inválida." });
      return;
    }

    const documentsBucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
    const ttl = signedR2Ttl(expiresIn, bucket === documentsBucket);

    const municipalityId = extractMunicipalityId(objectKey);
    if (objectKey.includes("/dam-originals/")) {
      const match = /^municipalities\/([a-f0-9-]{36})\/processes\/([a-f0-9-]{36})\/dam-originals\/([a-f0-9-]{36})\/[a-f0-9]{64}\.pdf$/.exec(objectKey);
      if (!match) { json(res, 400, { error: "Referência do PDF original inválida." }); return; }
      const allowed = await callDataApiRpc(req, "authorize_payment_guide_original_read_v1", {
        _guide_id: match[3], _municipality_id: match[1], _process_id: match[2], _object_key: objectKey,
      });
      if (!allowed.ok || allowed.payload !== true) {
        json(res, allowed.status === 401 ? 401 : 403, { error: "Sem acesso ao PDF original desta guia." }); return;
      }
    }
    const logosBucket = readEnv("R2_BUCKET_LOGOS") || "sigapro-logos";
    if (bucket === logosBucket) {
      const permission = await authorizeR2LogoRead(req, objectKey);
      if (permission.ok === false) { json(res, permission.status, { error: permission.error }); return; }
    }
    // DAM originals have their own immutable-guide authorization RPC above.
    // A public municipal legal rule is the only other unregistered exception.
    const isGuideOriginal = objectKey.includes("/dam-originals/");
    if (bucket === documentsBucket && !isGuideOriginal && !isPublicLegislationPdfKey(objectKey)) {
      const permission = await authorizePrivateR2DocumentRead(req, objectKey, municipalityId);
      if (permission.ok === false) {
        json(res, permission.status, { error: permission.error });
        return;
      }
    }

    const municipalTarget = municipalityId
      ? await resolveMunicipalDocumentTarget(req, municipalityId, bucket, objectKey)
      : null;

    if (municipalTarget) {
      try {
        // BYOS credentials can sign a non-existent object offline. Check the
        // original BEFORE reporting success to the PDF viewer.
        await municipalTarget.client.send(new HeadObjectCommand({
          Bucket: municipalTarget.bucket,
          Key: municipalTarget.objectKey,
        }));
        const signedUrl = await getSignedUrl(
          municipalTarget.client,
          new GetObjectCommand({
            Bucket: municipalTarget.bucket,
            Key: municipalTarget.objectKey,
          }),
          { expiresIn: ttl },
        );
        json(res, 200, {
          signedUrl,
          bucket: requestedBucket,
          resolvedBucket: bucket,
          objectKey,
          storageProvider: "municipal_s3",
        });
        return;
      } finally {
        municipalTarget.client.destroy();
      }
    }

    if (!envOk) {
      throw new Error("R2_ENV_MISSING");
    }

    let signedUrl = "";
    let lastError: unknown = null;

    for (const endpoint of getR2EndpointCandidates()) {
      const client = new S3Client({
        region: "auto",
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      try {
        // O upload já possui fallback entre endpoints. A leitura precisa localizar
        // fisicamente o MESMO objeto antes de assinar, ou uma URL válida pode
        // apontar para a conta errada e retornar 404 somente em produção.
        await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: objectKey,
          }),
        );

        signedUrl = await getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: bucket,
            Key: objectKey,
          }),
          { expiresIn: ttl },
        );
        break;
      } catch (error) {
        lastError = error;
      } finally {
        client.destroy();
      }
    }

    if (!signedUrl) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Objeto não encontrado no armazenamento R2 configurado.");
    }

    json(res, 200, { signedUrl, bucket: requestedBucket, resolvedBucket: bucket, objectKey, storageProvider: "sigapro_r2" });
  } catch (error) {
    const failure = classifyR2SignFailure(error);
    // One sanitized code is sufficient to correlate failures across R2,
    // fallback endpoints and municipal S3. Never log tokens, signed URLs or
    // provider response bodies here.
    console.warn("[SIGAPRO][R2Sign] assinatura indisponível", {
      code: failure.code,
    });
    json(res, failure.status, { error: failure.error, code: failure.code });
  }
}
