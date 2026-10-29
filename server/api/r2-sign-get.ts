import { getR2EndpointCandidates, resolveR2Endpoint } from "../r2-runtime.js";
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

// Only historical public legislation is intentionally readable without
// a signed-in municipal session. Every process document is private.
function isPublicLegalDocumentKey(objectKey: string) {
  return /^municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/legislation(?:[-/]|$)/i.test(objectKey);
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
      select: "id,municipality_id,tenant_id",
      limit: "1",
    });
    const result = await fetch(`${getDataApiUrl()}/process_documents?${query.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!result.ok) {
      return {
        ok: false,
        status: result.status === 401 ? 401 : result.status >= 500 ? 503 : 403,
        error: "Não foi possível confirmar a autorização do documento.",
      };
    }
    const rows: unknown = await result.json();
    const document = Array.isArray(rows) ? rows[0] as
      | { municipality_id?: unknown; tenant_id?: unknown }
      | undefined : undefined;
    if (!document) return { ok: false, status: 403, error: "Documento não disponível para este usuário." };
    const documentMunicipalityId = String(document.municipality_id || document.tenant_id || "").toLowerCase();
    if (keyMunicipalityId && documentMunicipalityId !== keyMunicipalityId.toLowerCase()) {
      return { ok: false, status: 403, error: "Documento fora do município autorizado." };
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
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: Req) {
  if (req.body && typeof req.body === "object") return req.body;
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

    console.log("[ProdAudit][R2Sign] env", {
      hasEndpoint: Boolean(endpoint),
      hasAccessKeyId: Boolean(accessKeyId),
      hasSecret: Boolean(secretAccessKey),
      accessKeyLength: accessKeyId.length,
    });

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

    if (typeof objectKey !== "string" || !objectKey) {
      json(res, 400, { error: "Chave do objeto inválida." });
      return;
    }

    const ttl =
      typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? Math.max(60, Math.min(expiresIn, 86400))
        : 21600;

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
    const documentsBucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
    // DAM originals have their own immutable-guide authorization RPC above.
    // A public municipal legal rule is the only other unregistered exception.
    const isGuideOriginal = objectKey.includes("/dam-originals/");
    if (bucket === documentsBucket && !isGuideOriginal && !isPublicLegalDocumentKey(objectKey)) {
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
    }

    if (!envOk) {
      throw new Error("Variáveis R2 ausentes no ambiente.");
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
      }
    }

    if (!signedUrl) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Objeto não encontrado no armazenamento R2 configurado.");
    }

    json(res, 200, { signedUrl, bucket: requestedBucket, resolvedBucket: bucket, objectKey, storageProvider: "sigapro_r2" });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Erro ao gerar link de leitura.";
    const signatureMismatch = /signature.*does not match|SignatureDoesNotMatch/i.test(rawMessage);
    const message = signatureMismatch
      ? "Falha de autenticação no armazenamento R2. O endpoint e as credenciais precisam pertencer à mesma conta."
      : rawMessage;
    console.error("[SIGAPRO][R2] Falha no sign-get", { error: rawMessage });
    json(res, 500, {
      error: message,
      code: signatureMismatch ? "R2_SIGNATURE_MISMATCH" : "R2_ERROR",
    });
  }
}
