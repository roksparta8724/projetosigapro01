/**
 * Public municipal legislation opener.
 *
 * Only serves object keys inside municipalities/<uuid>/legislation...
 * and redirects the browser to a short-lived signed URL in the documents bucket.
 * This keeps localhost and production on the same opening path without exposing
 * credentials or relying on an expiring URL stored in the database.
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  return raw ? String(raw).replace(/^['"]|['"]$/g, "").trim() : "";
}

function getR2EndpointCandidates() {
  const candidates: string[] = [];

  // R2_ENDPOINT is the endpoint actually used by upload flows. Keep it first so
  // read/sign operations never drift to a stale R2_ACCOUNT_ID from another account.
  const rawEndpoint = readEnv("R2_ENDPOINT");
  if (rawEndpoint) {
    try {
      const parsed = new URL(
        /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`,
      );
      candidates.push(`${parsed.protocol}//${parsed.host}`);
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

function isMunicipalLegislationObject(objectKey: string) {
  return /^municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/legislation(?:[-/]|$)/i.test(
    objectKey.replace(/^\/+/, ""),
  );
}

function fail(res: Res, status: number, message: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(message);
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET") {
    fail(res, 405, "Método não permitido.");
    return;
  }

  try {
    const requestUrl = new URL(req.url || "/api/legislation-open", "https://sigapro.local");
    const objectKey = String(requestUrl.searchParams.get("objectKey") || "")
      .trim()
      .replace(/^\/+/, "");

    if (!objectKey || !isMunicipalLegislationObject(objectKey)) {
      fail(res, 400, "Documento de legislação inválido.");
      return;
    }

    const endpoint = resolveR2Endpoint();
    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    const bucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      fail(res, 503, "Armazenamento de documentos indisponível.");
      return;
    }

    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    const signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ResponseContentDisposition: "inline",
        ResponseContentType: "application/pdf",
      }),
      { expiresIn: 900 },
    );

    res.statusCode = 302;
    res.setHeader("Location", signedUrl);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.end();
  } catch (error) {
    fail(
      res,
      500,
      error instanceof Error
        ? `Não foi possível abrir o documento: ${error.message}`
        : "Não foi possível abrir o documento.",
    );
  }
}
