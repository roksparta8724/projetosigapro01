import { getR2EndpointCandidates } from "../server/r2-runtime.js";
import { isPublicLegislationPdfKey } from "../server/r2-object-key-validation.js";
/**
 * Public municipal legislation opener.
 *
 * Only serves object keys inside municipalities/<uuid>/legislation...
 * and redirects the browser to a short-lived signed URL in the documents bucket.
 * This keeps localhost and production on the same opening path without exposing
 * credentials or relying on an expiring URL stored in the database.
 */

import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  return raw ? String(raw).replace(/^['"]|['"]$/g, "").trim() : "";
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

    if (!objectKey || !isPublicLegislationPdfKey(objectKey)) {
      fail(res, 400, "Documento de legislação inválido.");
      return;
    }

    const endpoints = getR2EndpointCandidates();
    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    const bucket = readEnv("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
    if (!endpoints.length || !accessKeyId || !secretAccessKey || !bucket) {
      fail(res, 503, "Armazenamento de documentos indisponível.");
      return;
    }

    let lastStatus = 503;
    // Verify the original exists in the exact bucket before redirecting.
    // A presigned URL is generated offline and would otherwise look valid
    // while opening a 404 at the storage endpoint.
    for (const endpoint of endpoints) {
      const client = new S3Client({
        region: "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
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
        return;
      } catch (error) {
        const responseStatus = (error as { $metadata?: { httpStatusCode?: number } } | null)
          ?.$metadata?.httpStatusCode;
        lastStatus = responseStatus === 404 ? 404 : 503;
      } finally {
        client.destroy();
      }
    }
    fail(res, lastStatus, lastStatus === 404
      ? "Documento oficial não encontrado no armazenamento desta Prefeitura."
      : "Armazenamento de documentos temporariamente indisponível.");
  } catch {
    fail(res, 503, "Não foi possível abrir o documento oficial neste momento.");
  }
}
