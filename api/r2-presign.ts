/**
 * api/r2-presign.ts — Cloudflare Workers handler
 *
 * Recebe { bucket, objectKey, contentType }
 * Retorna { uploadUrl, publicUrl, bucket, objectKey }
 * usando S3 presigned PUT URL via @aws-sdk/s3-request-presigner.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface Env {
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID?: string;
  R2_PUBLIC_BASE_URL?: string;
  R2_BUCKET_LOGOS?: string;
  R2_BUCKET_DOCUMENTOS?: string;
}

function getAllowedBuckets(env: Env) {
  return new Set<string>([
    env.R2_BUCKET_LOGOS || "sigapro-logos",
    env.R2_BUCKET_DOCUMENTOS || "sigapro-documentos",
  ]);
}

function buildPublicUrl(env: Env, bucket: string, objectKey: string) {
  const base = env.R2_PUBLIC_BASE_URL;
  if (base) {
    return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
  }
  const account = env.R2_ACCOUNT_ID;
  if (account) {
    return `https://${bucket}.${account}.r2.cloudflarestorage.com/${objectKey.replace(/^\/+/, "")}`;
  }
  return "";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Método não permitido" }, 405);
    }

    try {
      if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
        throw new Error("Variáveis R2 ausentes no ambiente.");
      }

      const body = (await request.json().catch(() => null)) as {
        bucket?: unknown;
        objectKey?: unknown;
        contentType?: unknown;
      } | null;

      if (!body) {
        return jsonResponse({ error: "Body JSON inválido." }, 400);
      }

      const { bucket, objectKey, contentType } = body;
      const allowedBuckets = getAllowedBuckets(env);

      if (
        typeof bucket !== "string" ||
        !bucket ||
        !allowedBuckets.has(bucket)
      ) {
        return jsonResponse({ error: "Bucket inválido." }, 400);
      }

      if (typeof objectKey !== "string" || !objectKey) {
        return jsonResponse({ error: "Chave do objeto inválida." }, 400);
      }

      const resolvedContentType =
        typeof contentType === "string" && contentType
          ? contentType
          : "application/octet-stream";

      const client = new S3Client({
        region: "auto",
        endpoint: env.R2_ENDPOINT,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          ContentType: resolvedContentType,
        }),
        { expiresIn: 300 }, // 5 minutos
      );

      const publicUrl = buildPublicUrl(env, bucket, objectKey);

      return jsonResponse({ uploadUrl, publicUrl, bucket, objectKey }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao gerar link de upload.";
      console.error("[SIGAPRO][R2] Falha no presign", { error: message });
      return jsonResponse({ error: message }, 500);
    }
  },
};
