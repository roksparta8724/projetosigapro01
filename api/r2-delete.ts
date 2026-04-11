/**
 * api/r2-delete.ts — Cloudflare Workers handler
 *
 * Recebe { bucket, objectKey }
 * Executa DeleteObject no R2 via S3 SDK.
 */

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

interface Env {
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_LOGOS?: string;
  R2_BUCKET_DOCUMENTOS?: string;
}

function getAllowedBuckets(env: Env) {
  return new Set<string>([
    env.R2_BUCKET_LOGOS || "sigapro-logos",
    env.R2_BUCKET_DOCUMENTOS || "sigapro-documentos",
  ]);
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
      } | null;

      if (!body) {
        return jsonResponse({ error: "Body JSON inválido." }, 400);
      }

      const { bucket, objectKey } = body;
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

      const client = new S3Client({
        region: "auto",
        endpoint: env.R2_ENDPOINT,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
      );

      console.log("[SIGAPRO][R2] Arquivo removido", { bucket, objectKey });

      return jsonResponse({ ok: true, bucket, objectKey }, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao remover arquivo.";
      console.error("[SIGAPRO][R2] Falha na remoção", { error: message });
      return jsonResponse({ error: message }, 500);
    }
  },
};
