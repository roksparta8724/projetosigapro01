/**
 * api/r2-sign-get.ts — Vercel Serverless handler
 *
 * Recebe { bucket, objectKey, expiresIn }
 * Retorna { signedUrl, bucket, objectKey }
 * usando S3 presigned GET URL via @aws-sdk/s3-request-presigner.
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { resolveMunicipalDocumentTarget } from "../server/municipal-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function normalizeR2AccountId(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const labels = url.hostname.toLowerCase().split(".");
    const r2Index = labels.indexOf("r2");
    if (r2Index > 0 && labels.slice(r2Index).join(".") === "r2.cloudflarestorage.com") {
      return labels[r2Index - 1].replace(/[^a-z0-9]/g, "");
    }
  } catch {
    // Pode ser somente o account id.
  }

  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, "")
    .replace(/[^a-zA-Z0-9]/g, "");
}

function resolveR2Endpoint() {
  const accountIdFromEnv = normalizeR2AccountId(readEnv("R2_ACCOUNT_ID"));
  if (accountIdFromEnv && !/^sua_?account_?id$/i.test(accountIdFromEnv)) {
    return `https://${accountIdFromEnv}.r2.cloudflarestorage.com`;
  }

  const rawEndpoint = readEnv("R2_ENDPOINT");
  if (!rawEndpoint) return "";

  const accountIdFromEndpoint = normalizeR2AccountId(rawEndpoint);
  if (accountIdFromEndpoint) {
    return `https://${accountIdFromEndpoint}.r2.cloudflarestorage.com`;
  }

  return "";
}

function extractMunicipalityId(objectKey: string) {
  const match = /^municipalities\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\//i.exec(objectKey);
  return match?.[1] || "";
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

    const { bucket, objectKey, expiresIn } = body ?? {};
    const allowedBuckets = getAllowedBuckets();

    if (typeof bucket !== "string" || !bucket || !allowedBuckets.has(bucket)) {
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
        bucket,
        objectKey,
        storageProvider: "municipal_s3",
      });
      return;
    }

    if (!envOk) {
      json(res, 503, {
        error: "Armazenamento R2 oficial não configurado neste ambiente.",
        code: "R2_CONFIG_MISSING",
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

    const signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
      { expiresIn: ttl },
    );

    json(res, 200, { signedUrl, bucket, objectKey, storageProvider: "sigapro_r2" });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Erro ao gerar link de leitura.";
    const signatureMismatch = /signature.*does not match|SignatureDoesNotMatch/i.test(rawMessage);
    const message = signatureMismatch
      ? "Falha de autenticação no armazenamento R2. O endpoint e as credenciais precisam pertencer à mesma conta."
      : rawMessage;
    console.error("[SIGAPRO][R2] Falha no sign-get", { error: rawMessage });
    json(res, signatureMismatch ? 502 : 500, {
      error: message,
      code: signatureMismatch ? "R2_SIGNATURE_MISMATCH" : "R2_ERROR",
    });
  }
}
