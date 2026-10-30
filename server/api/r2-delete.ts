import { resolveR2Endpoint } from "../r2-runtime.js";
/**
 * api/r2-delete.ts — Vercel Serverless handler
 *
 * Recebe { bucket, objectKey }
 * Retorna { ok: true, bucket, objectKey }
 */

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { callDataApiRpc, getDataApiUrl, resolveMunicipalDocumentTarget } from "../municipal-storage.js";

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

export async function authorizeR2Delete(
  req: Req,
  bucket: string,
  objectKey: string,
  municipalityId: string,
  currentProfileId: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const documentsBucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";

  // Deleting an object directly would bypass process history, document versions,
  // signatures, retention controls and audit events. Use a future dedicated,
  // transactional archival workflow rather than deleting process bytes here.
  if (bucket === documentsBucket) {
    return { ok: false, status: 409, error: "Documentos de processos não podem ser excluídos diretamente do armazenamento." };
  }

  // This RPC verifies membership in the target municipality, not object ownership.
  // Therefore it is necessary but never sufficient to delete a logo or avatar.
  const scope = municipalityId
    ? await callDataApiRpc(req, "has_tenant_access", { target_tenant: municipalityId })
    : await callDataApiRpc(req, "is_master", {});
  if (!scope.ok || scope.payload !== true) {
    return {
      ok: false,
      status: scope.status === 401 ? 401 : 403,
      error: "Sem permissão para excluir arquivos deste município.",
    };
  }
  // Only the platform master can delete tenantless/legacy branding objects.
  if (!municipalityId) return { ok: true };

  const avatar = /^municipalities\/[0-9a-f-]{36}\/profiles\/avatars\/([a-zA-Z0-9_-]+)\/[^/]+$/i.exec(objectKey);
  if (avatar && currentProfileId && avatar[1].toLowerCase() === currentProfileId.toLowerCase()) {
    return { ok: true };
  }

  // Other users' profile photos and institutional branding require an
  // administrative account in that same municipality (or a platform master).
  const admin = await callDataApiRpc(req, "is_municipality_admin", {});
  if (admin.ok && admin.payload === true) return { ok: true };
  const master = await callDataApiRpc(req, "is_master", {});
  if (master.ok && master.payload === true) return { ok: true };
  return {
    ok: false,
    status: admin.status === 401 || master.status === 401 ? 401 : 403,
    error: "Somente o titular da foto ou a administração autorizada pode excluir este arquivo.",
  };
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

  try {
    const endpoint = resolveR2Endpoint();
    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    const envOk = Boolean(endpoint && accessKeyId && secretAccessKey);

    console.log("[ProdAudit][R2Delete] env", {
      hasEndpoint: Boolean(endpoint),
      hasAccessKeyId: Boolean(accessKeyId),
      hasSecret: Boolean(secretAccessKey),
      accessKeyLength: accessKeyId.length,
    });

    const body = (await readJsonBody(req)) as { bucket?: unknown; objectKey?: unknown };
    const { bucket: requestedBucket, objectKey } = body ?? {};
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

    const municipalityId = extractMunicipalityId(objectKey);
    if (objectKey.includes("/dam-originals/") ||
        /^municipalities\/[a-f0-9-]{36}\/analysis-signed-fiches\//i.test(objectKey)) {
      json(res, 409, { error: "Documento original ou assinado permanente não pode ser removido." });
      return;
    }
    const access = await authorizeR2Delete(req, bucket, objectKey, municipalityId, auth.profileId);
    if (access.ok === false) {
      json(res, access.status, { error: access.error });
      return;
    }
    const municipalTarget = municipalityId
      ? await resolveMunicipalDocumentTarget(req, municipalityId, bucket, objectKey)
      : null;

    if (municipalTarget) {
      await municipalTarget.client.send(
        new DeleteObjectCommand({
          Bucket: municipalTarget.bucket,
          Key: municipalTarget.objectKey,
        }),
      );
      json(res, 200, {
        ok: true,
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

    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );

    json(res, 200, { ok: true, bucket: requestedBucket, resolvedBucket: bucket, objectKey, storageProvider: "sigapro_r2" });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Erro ao remover o arquivo.";
    const signatureMismatch = /signature.*does not match|SignatureDoesNotMatch/i.test(rawMessage);
    const message = signatureMismatch
      ? "Falha de autenticação no armazenamento R2. O endpoint e as credenciais precisam pertencer à mesma conta."
      : rawMessage;
    console.error("[SIGAPRO][R2] Falha no delete", { error: rawMessage });
    json(res, 500, {
      error: message,
      code: signatureMismatch ? "R2_SIGNATURE_MISMATCH" : "R2_ERROR",
    });
  }
}
