/**
 * api/r2-sign-get.ts — Vercel Serverless handler
 *
 * Recebe { bucket, objectKey, expiresIn }
 * Retorna { signedUrl, bucket, objectKey }
 * usando S3 presigned GET URL via @aws-sdk/s3-request-presigner.
 */

import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { resolveMunicipalDocumentTarget } from "../municipal-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type Req = import("http").IncomingMessage & { method?: string; body?: unknown };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function getR2EndpointCandidates() {
  const candidates: string[] = [];

  // Use the same endpoint preference as upload. This prevents a stale
  // R2_ACCOUNT_ID from signing a URL for a different account than the one
  // where the municipal logo/document was actually written.
  const rawEndpoint = readEnv("R2_ENDPOINT");
  if (rawEndpoint) {
    try {
      const url = new URL(
        /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`,
      );
      candidates.push(`${url.protocol}//${url.host}`);
    } catch {
      candidates.push(rawEndpoint.replace(/\/+$/, ""));
    }
  }

  const accountId = readEnv("R2_ACCOUNT_ID")
    .replace(/^https?:\/\//i, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, "")
    .replace(/[^a-zA-Z0-9]/g, "");

  if (accountId && !/^sua_?account_?id$/i.test(accountId)) {
    candidates.push(`https://${accountId}.r2.cloudflarestorage.com`);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function resolveR2Endpoint() {
  return getR2EndpointCandidates()[0] || "";
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
    const endpoints = getR2EndpointCandidates();
    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    const envOk = Boolean(endpoints.length && accessKeyId && secretAccessKey);

    console.log("[ProdAudit][R2Sign] env", {
      hasEndpoint: Boolean(endpoints.length),
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

    for (const endpoint of endpoints) {
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
