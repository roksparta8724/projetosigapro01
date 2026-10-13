/**
 * api/r2-delete.ts — Vercel Serverless handler
 *
 * Recebe { bucket, objectKey }
 * Retorna { ok: true, bucket, objectKey }
 */

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { resolveMunicipalDocumentTarget } from "../server/municipal-storage";

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

const VALIDATED_NEON_DATA_API_URL =
  "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";

function isR2AuthRequired() {
  const configured = readEnv("R2_REQUIRE_AUTH").toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return readEnv("VERCEL_ENV").toLowerCase() === "production";
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

  const dataApiUrl = (
    readEnv("R2_AUTH_DATA_API_URL") ||
    readEnv("VITE_NEON_DATA_API_URL") ||
    VALIDATED_NEON_DATA_API_URL
  ).replace(/\/+$/, "");

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

function getAllowedBuckets() {
  return new Set<string>([
    readEnv("R2_BUCKET_LOGOS") || "sigapro-logos",
    readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos",
  ]);
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

    if (!envOk) {
      throw new Error("Variáveis R2 ausentes no ambiente.");
    }

    const body = (await readJsonBody(req)) as { bucket?: unknown; objectKey?: unknown };
    const { bucket, objectKey } = body ?? {};
    const allowedBuckets = getAllowedBuckets();

    if (typeof bucket !== "string" || !bucket || !allowedBuckets.has(bucket)) {
      json(res, 400, { error: "Bucket inválido." });
      return;
    }

    if (typeof objectKey !== "string" || !objectKey) {
      json(res, 400, { error: "Chave do objeto inválida." });
      return;
    }

    const municipalityId = extractMunicipalityId(objectKey);
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
        bucket,
        objectKey,
        storageProvider: "municipal_s3",
      });
      return;
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

    json(res, 200, { ok: true, bucket, objectKey, storageProvider: "sigapro_r2" });
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
