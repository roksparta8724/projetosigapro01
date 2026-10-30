import { getR2EndpointCandidates, resolveR2Endpoint } from "../r2-runtime.js";
/**
 * api/r2-upload.ts — Vercel Serverless handler
 *
 * Recebe { bucket, objectKey, contentType, fileName, base64 }
 * Retorna { bucket, objectKey, publicUrl }
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { getDataApiUrl, resolveMunicipalDocumentTarget } from "../municipal-storage.js";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function isR2CredentialError(error: unknown) {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name || "")
      : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return /SignatureDoesNotMatch|InvalidAccessKeyId|AccessDenied/i.test(name) ||
    /signature.*does not match|invalid access key|access denied/i.test(message);
}

export function isCreateOnlyDocumentBucket(bucket: string) {
  // A newly uploaded process document gets a new object key (UUID and revision).
  // No common upload should silently overwrite an older document revision.
  return bucket === (readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos");
}

async function putR2ObjectWithFallback(input: {
  bucket: string;
  objectKey: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}) {
  const endpoints = getR2EndpointCandidates();
  let lastError: unknown;

  for (const endpoint of endpoints) {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: readEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: readEnv("R2_SECRET_ACCESS_KEY"),
      },
    });

    try {
      await client.send(new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
        // Every process document is create-once, including ordinary attachments.
        ...(isCreateOnlyDocumentBucket(input.bucket) ? { IfNoneMatch: "*" } : {}),
      }));
      return;
    } catch (error) {
      if (input.objectKey.includes("/dam-originals/") && (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 412) return;
      lastError = error;
      if (!isR2CredentialError(error)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha de autenticação no armazenamento R2.");
}

export function isR2AuthRequired() {
  // Never allow a stale test override to disable auth in production.
  if (readEnv("VERCEL_ENV").toLowerCase() === "production") return true;
  return readEnv("R2_REQUIRE_AUTH").toLowerCase() === "true";
}

function readBearer(req: Req) {
  const raw = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1]?.trim() || "";
}

function extractMunicipalityId(objectKey: string) {
  const match = /^municipalities\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\//i.exec(objectKey);
  return match?.[1] || "";
}

async function callDataApiRpc(req: Req, fn: string, body: Record<string, unknown>) {
  const token = readBearer(req);
  if (!token) {
    return { ok: false as const, status: 401, payload: null, error: "Autenticação necessária." };
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
    const payload = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      payload,
      error:
        payload && typeof payload === "object" && "message" in (payload as Record<string, unknown>)
          ? String((payload as Record<string, unknown>).message || "")
          : "",
    } as const;
  } catch {
    return { ok: false as const, status: 503, payload: null, error: "Validação contratual indisponível." };
  }
}

async function requireAuthenticatedProfile(req: Req) {
  if (!isR2AuthRequired()) {
    return { ok: true as const, profileId: null as string | null };
  }

  const token = readBearer(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Autenticação necessária." };
  }

  const dataApiUrl = getDataApiUrl();

  try {
    const response = await fetch(`${dataApiUrl}/rpc/current_profile_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: "{}",
    });

    const payload = await response.json().catch(() => null);
    const profileId =
      typeof payload === "string"
        ? payload
        : payload && typeof payload === "object"
          ? ((payload as Record<string, unknown>).id ||
             (payload as Record<string, unknown>).profile_id ||
             null)
          : null;

    if (!response.ok || !profileId) {
      return { ok: false as const, status: 401, error: "Sessão inválida ou expirada." };
    }

    return { ok: true as const, profileId: String(profileId) };
  } catch {
    return { ok: false as const, status: 503, error: "Validação de autenticação indisponível." };
  }
}

function resolveRequestedBucket(value: string) {
  const logos = readEnv("R2_BUCKET_LOGOS") || "sigapro-logos";
  const documents = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";

  if (value === "process-documents") return documents;
  if (value === "institutional-branding" || value === "profile-assets") return logos;
  if (value === documents || value === logos) return value;
  return "";
}

export function buildPublicUrl(bucket: string, objectKey: string) {
  // A configured public CDN for logos/legislation does not authorize publishing
  // payment originals, signed technical reports or private process attachments.
  const documentsBucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
  const publicLegalKey =
    /^municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/legislation(?:[-/]|$)/i.test(objectKey);
  if (bucket === documentsBucket && !publicLegalKey) return "";

  const base = readEnv("R2_PUBLIC_BASE_URL");
  if (base) return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;

  // Without a public host, persist only the key and authorize a signed GET.
  return "";
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

  const auth = await requireAuthenticatedProfile(req);
  if (!auth.ok) {
    json(res, auth.status, { error: auth.error });
    return;
  }

  let conflictObjectKey = "";
  try {
    const endpoint = resolveR2Endpoint();
    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    const envOk = Boolean(endpoint && accessKeyId && secretAccessKey);

    console.log("[ProdAudit][R2Upload] env", {
      hasEndpoint: Boolean(endpoint),
      hasAccessKeyId: Boolean(accessKeyId),
      hasSecret: Boolean(secretAccessKey),
      accessKeyLength: accessKeyId.length,
    });

    const body = (await readJsonBody(req)) as {
      bucket?: unknown;
      objectKey?: unknown;
      contentType?: unknown;
      fileName?: unknown;
      base64?: unknown;
    };

    const {
      bucket: requestedBucket,
      objectKey,
      contentType,
      base64,
      fileName,
    } = body ?? {};
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

    if (typeof base64 !== "string" || !base64) {
      json(res, 400, { error: "Arquivo inválido." });
      return;
    }

    conflictObjectKey = objectKey;
    const buffer = Buffer.from(base64, "base64");
    const municipalityId = extractMunicipalityId(objectKey);
    // Tenantless/legacy keys are never writable by ordinary municipal accounts.
    // This also prevents malformed municipality paths from bypassing tenant checks.
    if (!municipalityId) {
      const platformPermission = await callDataApiRpc(req, "is_master", {});
      if (!platformPermission.ok || platformPermission.payload !== true) {
        json(res, platformPermission.status === 401 ? 401 : 403, {
          error: "Somente o administrador geral pode enviar arquivos sem identificação municipal.",
        });
        return;
      }
    }
    let damOriginalMetadata: Record<string, string> | undefined;
    if (objectKey.includes("/dam-originals/")) {
      if (contentType !== "application/pdf" || buffer.byteLength > 25 * 1024 * 1024) {
        json(res, 400, { error: "O original DAM deve ser um PDF de até 25 MB." }); return;
      }
      const match = /^municipalities\/([a-f0-9-]{36})\/processes\/([a-f0-9-]{36})\/dam-originals\/([a-f0-9-]{36})\/([a-f0-9]{64})\.pdf$/.exec(objectKey);
      if (!match || buffer.subarray(0, 5).toString() !== "%PDF-" || createHash("sha256").update(buffer).digest("hex") !== match[4]) {
        json(res, 400, { error: "PDF original ou hash inválido." }); return;
      }
      const allowed = await callDataApiRpc(req, "authorize_payment_guide_original_upload_v2", {
        _guide_id: match[3], _municipality_id: match[1], _process_id: match[2],
      });
      if (!allowed.ok || allowed.payload !== true) {
        json(res, 403, { error: "Guia não permite arquivamento do PDF original." }); return;
      }
      damOriginalMetadata = { municipality: match[1], process: match[2], guide: match[3], sha256: match[4] };
    }
    const municipalTarget = municipalityId
      ? await resolveMunicipalDocumentTarget(req, municipalityId, bucket, objectKey)
      : null;

    if (municipalityId) {
      const accessCheck = await callDataApiRpc(req, "has_tenant_access", {
        target_tenant: municipalityId,
      });
      const hasTenantAccess =
        accessCheck.ok &&
        (accessCheck.payload === true ||
          accessCheck.payload === "true" ||
          (accessCheck.payload &&
            typeof accessCheck.payload === "object" &&
            Boolean((accessCheck.payload as Record<string, unknown>).has_tenant_access)));

      if (!hasTenantAccess) {
        json(res, accessCheck.status === 401 ? 401 : 403, {
          error: "Sem acesso ao armazenamento desta Prefeitura.",
        });
        return;
      }

      // Municipal crests and headers are controlled by the municipality administration.
      const brandingWrite = bucket === (readEnv("R2_BUCKET_LOGOS") || "sigapro-logos") &&
        /^municipalities\/[0-9a-f-]{36}\/branding(?:\/|$)/i.test(objectKey);
      if (brandingWrite) {
        const admin = await callDataApiRpc(req, "is_municipality_admin", {});
        if (!admin.ok || admin.payload !== true) {
          const master = await callDataApiRpc(req, "is_master", {});
          if (!master.ok || master.payload !== true) {
            json(res, 403, { error: "Somente a administração municipal pode alterar a identidade institucional." });
            return;
          }
        }
      }
      const documentBucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
      // Quando a Prefeitura usa armazenamento próprio, os bytes deixam de consumir
      // a franquia física do R2 do SIGAPRO. As demais regras contratuais continuam.
      if (!municipalTarget || bucket !== documentBucket) {
        const capability =
          bucket === documentBucket ? "storage_bytes" : "module:Configurações";
        const increment = bucket === documentBucket ? buffer.byteLength : 0;
        const entitlement = await callDataApiRpc(req, "assert_municipality_entitlement_v1", {
          _municipality_id: municipalityId,
          _capability: capability,
          _increment: increment,
        });

        if (!entitlement.ok) {
          json(res, 409, {
            error:
              entitlement.error ||
              (capability === "storage_bytes"
                ? "O envio excede o limite de armazenamento contratado."
                : "O plano desta Prefeitura não permite alterar arquivos institucionais."),
          });
          return;
        }
      }
    }

    const resolvedContentType =
      typeof contentType === "string" && contentType
        ? contentType
        : "application/octet-stream";

    if (municipalTarget) {
      await municipalTarget.client.send(new PutObjectCommand({
        Bucket: municipalTarget.bucket,
        Key: municipalTarget.objectKey,
        Body: buffer,
        ContentType: resolvedContentType,
        Metadata: damOriginalMetadata,
        // Municipal S3 must preserve old document revisions as well.
        ...(isCreateOnlyDocumentBucket(bucket) ? { IfNoneMatch: "*" } : {}),
      })).catch((error) => {
        if (objectKey.includes("/dam-originals/") && error?.$metadata?.httpStatusCode === 412) return;
        throw error;
      });

      json(res, 200, {
        bucket: requestedBucket,
        resolvedBucket: bucket,
        objectKey,
        publicUrl: "",
        storageProvider: "municipal_s3",
      });
      return;
    }

    if (!envOk) {
      throw new Error("Variáveis R2 ausentes no ambiente.");
    }

    await putR2ObjectWithFallback({
      bucket,
      objectKey,
      body: buffer,
      contentType: resolvedContentType,
      metadata: damOriginalMetadata,
    });

    json(res, 200, {
      bucket: requestedBucket,
      resolvedBucket: bucket,
      objectKey,
      publicUrl: buildPublicUrl(bucket, objectKey),
      storageProvider: "sigapro_r2",
    });
  } catch (error) {
    // Conditional write conflicts must never overwrite signed originals.
    const writeStatus = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
    if (writeStatus === 412) {
      if (conflictObjectKey.includes("/analysis-signed-fiches/") || conflictObjectKey.includes("/dam-originals/")) {
        json(res, 409, { error: "Este PDF assinado ou original já existe e não pode ser substituído.", code: "SIGNED_PDF_IMMUTABLE" });
      } else {
        json(res, 409, { error: "Documento já armazenado. Envie uma nova versão com outra referência.", code: "DOCUMENT_ALREADY_EXISTS" });
      }
      return;
    }
    const rawMessage = error instanceof Error ? error.message : "Erro ao enviar o arquivo.";
    const signatureMismatch = isR2CredentialError(error);
    const message = signatureMismatch
      ? "Falha de autenticação no armazenamento R2. O endpoint e as credenciais precisam pertencer à mesma conta."
      : rawMessage;
    console.error("[SIGAPRO][R2] Falha no upload", { error: rawMessage });
    json(res, 500, {
      error: message,
      code: signatureMismatch ? "R2_SIGNATURE_MISMATCH" : "R2_ERROR",
    });
  }
}
