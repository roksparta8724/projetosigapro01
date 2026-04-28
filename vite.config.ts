import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REQUIRED_ENV = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_LOGOS",
  "R2_BUCKET_DOCUMENTOS",
] as const;

function readEnvValue(key: string) {
  const raw = process.env[key];
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  // Remove aspas simples/duplas caso estejam no .env
  return trimmed.replace(/^['"]|['"]$/g, "").trim();
}

function sanitizeAccessKeyId(value: string) {
  const normalized = value.replace(/\s+/g, "");
  // Se vier algo como 33 chars, mas hex, corta para 32
  const hexOnly = normalized.replace(/[^a-fA-F0-9]/g, "");
  if (hexOnly.length >= 32) {
    return hexOnly.slice(0, 32);
  }
  return normalized;
}

function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !readEnvValue(key));
  if (missing.length > 0) {
    throw new Error(`Variáveis R2 ausentes: ${missing.join(", ")}`);
  }
}

function buildPublicUrl(bucket: string, objectKey: string) {
  const base = readEnvValue("R2_PUBLIC_BASE_URL");
  if (base) {
    return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
  }
  const account = readEnvValue("R2_ACCOUNT_ID");
  if (account) {
    return `https://${bucket}.${account}.r2.cloudflarestorage.com/${objectKey.replace(/^\/+/, "")}`;
  }
  return "";
}

function readJsonBody(req: import("http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
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

function createR2DevApiPlugin(): Plugin {
  return {
    name: "sigapro-r2-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.method || !req.url.startsWith("/api/")) {
          next();
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Método não permitido" }));
          return;
        }

        try {
          assertEnv();
          const body = await readJsonBody(req);
          const client = new S3Client({
            region: "auto",
            endpoint: readEnvValue("R2_ENDPOINT"),
            credentials: {
              accessKeyId: sanitizeAccessKeyId(readEnvValue("R2_ACCESS_KEY_ID")),
              secretAccessKey: readEnvValue("R2_SECRET_ACCESS_KEY").replace(/\s+/g, ""),
            },
          });

          if (req.url.startsWith("/api/r2-upload")) {
            console.log("[SIGAPRO][R2] rota local /api/r2-upload acionada");
            const { bucket, objectKey, contentType, base64, fileName } = body ?? {};

            const allowedBuckets = new Set([
              readEnvValue("R2_BUCKET_LOGOS"),
              readEnvValue("R2_BUCKET_DOCUMENTOS"),
            ]);

            if (!bucket || !allowedBuckets.has(bucket)) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Bucket inválido." }));
              return;
            }

            if (!objectKey || typeof objectKey !== "string") {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Chave do objeto inválida." }));
              return;
            }

            if (!base64 || typeof base64 !== "string") {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Arquivo inválido." }));
              return;
            }

            const buffer = Buffer.from(base64, "base64");
            console.log("[SIGAPRO][R2] upload local", {
              bucket,
              objectKey,
              bytes: buffer.length,
              contentType,
              accessKeyLength: sanitizeAccessKeyId(readEnvValue("R2_ACCESS_KEY_ID")).length,
            });

            await client.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: objectKey,
                Body: buffer,
                ContentType: contentType || "application/octet-stream",
                Metadata: fileName ? { filename: fileName } : undefined,
              }),
            );

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                bucket,
                objectKey,
                publicUrl: buildPublicUrl(bucket, objectKey),
                fileName: fileName || null,
                contentType: contentType || null,
                fileSize: buffer.length,
              }),
            );
            return;
          }

          if (req.url.startsWith("/api/r2-delete")) {
            console.log("[SIGAPRO][R2] rota local /api/r2-delete acionada");
            const { bucket, objectKey } = body ?? {};
            const allowedBuckets = new Set([
              readEnvValue("R2_BUCKET_LOGOS"),
              readEnvValue("R2_BUCKET_DOCUMENTOS"),
            ]);

            if (!bucket || !allowedBuckets.has(bucket)) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Bucket inválido." }));
              return;
            }

            if (!objectKey || typeof objectKey !== "string") {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Chave do objeto inválida." }));
              return;
            }

            await client.send(
              new DeleteObjectCommand({
                Bucket: bucket,
                Key: objectKey,
              }),
            );

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
            return;
          }

          if (req.url.startsWith("/api/r2-presign")) {
            console.log("[SIGAPRO][R2] rota local /api/r2-presign acionada");
            const { bucket, objectKey, contentType } = body ?? {};
            const allowedBuckets = new Set([
              readEnvValue("R2_BUCKET_LOGOS"),
              readEnvValue("R2_BUCKET_DOCUMENTOS"),
            ]);

            if (!bucket || !allowedBuckets.has(bucket)) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Bucket inválido." }));
              return;
            }

            if (!objectKey || typeof objectKey !== "string") {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Chave do objeto inválida." }));
              return;
            }

            const uploadUrl = await getSignedUrl(
              client,
              new PutObjectCommand({
                Bucket: bucket,
                Key: objectKey,
                ContentType: contentType || "application/octet-stream",
              }),
              { expiresIn: 300 },
            );

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                uploadUrl,
                publicUrl: buildPublicUrl(bucket, objectKey),
                bucket,
                objectKey,
              }),
            );
            return;
          }

          if (req.url.startsWith("/api/r2-sign-get")) {
            console.log("[SIGAPRO][R2] rota local /api/r2-sign-get acionada");
            const { bucket, objectKey, expiresIn } = body ?? {};
            const allowedBuckets = new Set([
              readEnvValue("R2_BUCKET_LOGOS"),
              readEnvValue("R2_BUCKET_DOCUMENTOS"),
            ]);

            if (!bucket || !allowedBuckets.has(bucket)) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Bucket inválido." }));
              return;
            }

            if (!objectKey || typeof objectKey !== "string") {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Chave do objeto inválida." }));
              return;
            }

            const ttl =
              typeof expiresIn === "number" && expiresIn > 0 ? Math.min(expiresIn, 3600) : 900;

            const signedUrl = await getSignedUrl(
              client,
              new GetObjectCommand({
                Bucket: bucket,
                Key: objectKey,
              }),
              { expiresIn: ttl },
            );

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                signedUrl,
                bucket,
                objectKey,
              }),
            );
            return;
          }

          next();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro no upload.";
          console.error("[SIGAPRO][R2] erro rota local:", message);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.method || !req.url.startsWith("/api/")) {
          next();
          return;
        }
        server.middlewares.handle(req, res, next);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), createR2DevApiPlugin()].filter(
    Boolean,
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {},
  };
});
