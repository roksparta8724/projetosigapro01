/**
 * api/r2-upload.ts — Vercel Serverless handler
 *
 * Recebe { bucket, objectKey, contentType, fileName, base64 }
 * Retorna { bucket, objectKey, publicUrl }
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function sanitizeAccessKeyId(value: string) {
  const normalized = value.replace(/\s+/g, "");
  const hexOnly = normalized.replace(/[^a-fA-F0-9]/g, "");
  if (hexOnly.length >= 32) {
    return hexOnly.slice(0, 32);
  }
  return normalized;
}

function sanitizeSecret(value: string) {
  return value.replace(/\s+/g, "");
}

function getAllowedBuckets() {
  return new Set<string>([
    readEnv("R2_BUCKET_LOGOS") || "sigapro-logos",
    readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos",
  ]);
}

function buildPublicUrl(bucket: string, objectKey: string) {
  const base = readEnv("R2_PUBLIC_BASE_URL");
  if (base) {
    return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
  }
  const account = readEnv("R2_ACCOUNT_ID");
  if (account) {
    return `https://${bucket}.${account}.r2.cloudflarestorage.com/${objectKey.replace(/^\/+/, "")}`;
  }
  return "";
}

function setCors(res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
    const endpoint = readEnv("R2_ENDPOINT");
    const accessKeyId = sanitizeAccessKeyId(readEnv("R2_ACCESS_KEY_ID"));
    const secretAccessKey = sanitizeSecret(readEnv("R2_SECRET_ACCESS_KEY"));
    const envOk = Boolean(endpoint && accessKeyId && secretAccessKey);

    console.log("[ProdAudit][R2Upload] env", {
      hasEndpoint: Boolean(endpoint),
      hasAccessKeyId: Boolean(accessKeyId),
      hasSecret: Boolean(secretAccessKey),
      accessKeyLength: accessKeyId.length,
    });

    if (!envOk) {
      throw new Error("Variáveis R2 ausentes no ambiente.");
    }

    const body = (await readJsonBody(req)) as {
      bucket?: unknown;
      objectKey?: unknown;
      contentType?: unknown;
      fileName?: unknown;
      base64?: unknown;
    };

    const { bucket, objectKey, contentType, base64, fileName } = body ?? {};
    const allowedBuckets = getAllowedBuckets();

    if (typeof bucket !== "string" || !bucket || !allowedBuckets.has(bucket)) {
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

    const buffer = Buffer.from(base64, "base64");

    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: typeof contentType === "string" && contentType ? contentType : "application/octet-stream",
        Metadata: typeof fileName === "string" && fileName ? { filename: fileName } : undefined,
      }),
    );

    json(res, 200, {
      bucket,
      objectKey,
      publicUrl: buildPublicUrl(bucket, objectKey),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enviar o arquivo.";
    console.error("[SIGAPRO][R2] Falha no upload", { error: message });
    json(res, 500, { error: message });
  }
}
