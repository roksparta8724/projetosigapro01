/**
 * api/r2-upload.ts — Cloudflare Workers handler
 *
 * Recebe { bucket, objectKey, contentType, base64, fileName }
 * Faz PUT direto no R2 via S3 SDK (credenciais server-side, nunca expostas).
 *
 * Compatível com Cloudflare Workers + wrangler.toml bindings ou variáveis de env.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Tipos de ambiente (Cloudflare Workers env)
// ---------------------------------------------------------------------------

interface Env {
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID?: string;
  R2_PUBLIC_BASE_URL?: string;
  R2_BUCKET_LOGOS?: string;
  R2_BUCKET_DOCUMENTOS?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllowedBuckets(env: Env) {
  return new Set<string>([
    env.R2_BUCKET_LOGOS || "sigapro-logos",
    env.R2_BUCKET_DOCUMENTOS || "sigapro-documentos",
  ]);
}

function buildPublicUrl(env: Env, bucket: string, objectKey: string): string {
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

function assertRequiredEnv(env: Env) {
  const missing: string[] = [];
  if (!env.R2_ENDPOINT) missing.push("R2_ENDPOINT");
  if (!env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (missing.length > 0) {
    throw new Error(`Variáveis R2 ausentes: ${missing.join(", ")}`);
  }
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
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

// ---------------------------------------------------------------------------
// Handler principal (Cloudflare Workers fetch handler)
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Método não permitido" }, 405);
    }

    try {
      assertRequiredEnv(env);

      const body = (await request.json().catch(() => null)) as {
        bucket?: unknown;
        objectKey?: unknown;
        contentType?: unknown;
        base64?: unknown;
        fileName?: unknown;
      } | null;

      if (!body) {
        return jsonResponse({ error: "Body JSON inválido." }, 400);
      }

      const { bucket, objectKey, contentType, base64, fileName } = body;

      const allowedBuckets = getAllowedBuckets(env);

      if (
        typeof bucket !== "string" ||
        !bucket ||
        !allowedBuckets.has(bucket)
      ) {
        return jsonResponse(
          {
            error: `Bucket inválido. Permitidos: ${[...allowedBuckets].join(", ")}`,
          },
          400,
        );
      }

      if (typeof objectKey !== "string" || !objectKey) {
        return jsonResponse({ error: "Chave do objeto inválida." }, 400);
      }

      if (typeof base64 !== "string" || !base64) {
        return jsonResponse({ error: "Arquivo inválido." }, 400);
      }

      // Decodifica base64 → Uint8Array
      let buffer: Uint8Array;
      try {
        const binaryStr = atob(base64);
        buffer = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          buffer[i] = binaryStr.charCodeAt(i);
        }
      } catch {
        return jsonResponse({ error: "Falha ao decodificar o arquivo base64." }, 400);
      }

      if (buffer.length === 0) {
        return jsonResponse({ error: "Arquivo vazio." }, 400);
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

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: resolvedContentType,
          Metadata:
            typeof fileName === "string" && fileName
              ? { filename: fileName }
              : undefined,
        }),
      );

      const publicUrl = buildPublicUrl(env, bucket, objectKey);

      console.log("[SIGAPRO][R2] Upload concluido", {
        bucket,
        objectKey,
        publicUrl,
        fileSize: buffer.length,
        contentType: resolvedContentType,
      });

      return jsonResponse(
        {
          bucket,
          objectKey,
          publicUrl,
          fileName: typeof fileName === "string" ? fileName : null,
          contentType: resolvedContentType,
          fileSize: buffer.length,
        },
        200,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao enviar arquivo.";
      console.error("[SIGAPRO][R2] Falha no upload", { error: message });
      return jsonResponse({ error: message }, 500);
    }
  },
};
