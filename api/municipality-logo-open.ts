/**
 * Municipal logo opener.
 *
 * Serves only image objects stored under:
 * municipalities/<uuid>/branding/...
 *
 * The database keeps the persistent object key as the source of truth. This
 * endpoint makes localhost and production render the same logo without storing
 * expiring signed URLs in the database or requiring the browser to know R2
 * credentials.
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  return raw ? String(raw).replace(/^['"]|['"]$/g, "").trim() : "";
}

function resolveR2Endpoint() {
  // Keep parity with upload/legislation access: the configured endpoint is the
  // first authority because it may point to a different R2 account than an old
  // R2_ACCOUNT_ID.
  const rawEndpoint = readEnv("R2_ENDPOINT");
  if (rawEndpoint) {
    try {
      const parsed = new URL(
        /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`,
      );
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return rawEndpoint.replace(/\/+$/, "");
    }
  }

  const accountId = readEnv("R2_ACCOUNT_ID")
    .replace(/^https?:\/\//i, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, "")
    .replace(/[^a-zA-Z0-9]/g, "");

  return accountId && !/^sua_?account_?id$/i.test(accountId)
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : "";
}

function isMunicipalBrandingObject(objectKey: string) {
  const normalized = objectKey.replace(/^\/+/, "");
  return (
    /^municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/branding\/[a-zA-Z0-9/_ .()-]+\.(png|webp|jpe?g)$/i.test(
      normalized,
    ) &&
    !normalized.includes("..")
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
    const requestUrl = new URL(
      req.url || "/api/municipality-logo-open",
      "https://sigapro.local",
    );
    const objectKey = String(requestUrl.searchParams.get("objectKey") || "")
      .trim()
      .replace(/^\/+/, "");

    if (!objectKey || !isMunicipalBrandingObject(objectKey)) {
      fail(res, 400, "Logo municipal inválido.");
      return;
    }

    const endpoint = resolveR2Endpoint();
    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    const bucket = readEnv("R2_BUCKET_LOGOS") || "sigapro-logos";

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      fail(res, 503, "Armazenamento do logo municipal indisponível.");
      return;
    }

    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    const object = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );

    if (!object.Body || (object.ContentLength ?? 0) > 10 * 1024 * 1024) {
      fail(res, 413, "Logo indisponível ou muito grande.");
      return;
    }

    const bytes = await object.Body.transformToByteArray();
    if (bytes.length > 10 * 1024 * 1024) {
      fail(res, 413, "Logo muito grande.");
      return;
    }

    const contentType = String(object.ContentType || "");
    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      contentType.startsWith("image/") ? contentType : "image/png",
    );
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.end(Buffer.from(bytes));
  } catch (error) {
    fail(
      res,
      502,
      error instanceof Error
        ? `Não foi possível carregar o logo municipal: ${error.message}`
        : "Não foi possível carregar o logo municipal.",
    );
  }
}
