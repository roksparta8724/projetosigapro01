import { defineConfig, loadEnv, type Plugin } from "vite";
import { existsSync, readFileSync, statSync } from "node:fs";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REQUIRED_ENV = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_LOGOS",
  "R2_BUCKET_DOCUMENTOS",
] as const;

function resolvePrimaryWorktreeEnvDir() {
  const explicit = String(process.env.SIGAPRO_DEV_ENV_SOURCE || "").trim();
  if (explicit && existsSync(explicit)) return path.resolve(explicit);

  const gitEntry = path.resolve(process.cwd(), ".git");
  if (!existsSync(gitEntry)) return "";

  try {
    if (!statSync(gitEntry).isFile()) return "";
    const raw = readFileSync(gitEntry, "utf8").trim();
    const match = raw.match(/^gitdir:\s*(.+)$/i);
    if (!match?.[1]) return "";

    const linkedGitDir = path.resolve(process.cwd(), match[1].trim());
    const worktreesDir = path.dirname(linkedGitDir);
    const primaryGitDir = path.dirname(worktreesDir);
    if (path.basename(primaryGitDir).toLowerCase() !== ".git") return "";

    const primaryWorktree = path.dirname(primaryGitDir);
    return existsSync(primaryWorktree) ? primaryWorktree : "";
  } catch {
    return "";
  }
}

function loadDevelopmentEnvWithWorktreeFallback(mode: string) {
  const current = loadEnv(mode, process.cwd(), "");
  if (mode !== "development") return current;

  const primaryWorktree = resolvePrimaryWorktreeEnvDir();
  if (!primaryWorktree || path.resolve(primaryWorktree) === path.resolve(process.cwd())) {
    return current;
  }

  const fallback = loadEnv(mode, primaryWorktree, "");
  const merged = { ...fallback, ...current };

  if (Object.keys(fallback).length > 0) {
    console.log("[SIGAPRO][DevEnv] configuração local herdada da worktree principal", {
      source: primaryWorktree,
      current: process.cwd(),
    });
  }

  return merged;
}

function readEnvValue(key: string) {
  const raw = process.env[key];
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  // Remove aspas simples/duplas caso estejam no .env
  return trimmed.replace(/^['"]|['"]$/g, "").trim();
}

function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !readEnvValue(key));
  if (missing.length > 0) {
    throw new Error(`Variáveis R2 ausentes: ${missing.join(", ")}`);
  }
}

function hasCompleteLocalR2Env() {
  return REQUIRED_ENV.every((key) => Boolean(readEnvValue(key)));
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

function getR2EndpointCandidates() {
  const candidates: string[] = [];

  const accountId = normalizeR2AccountId(readEnvValue("R2_ACCOUNT_ID"));
  if (accountId && !/^(sua|seu)_?account_?id$/i.test(accountId)) {
    candidates.push(`https://${accountId}.r2.cloudflarestorage.com`);
  }

  const endpointAccountId = normalizeR2AccountId(readEnvValue("R2_ENDPOINT"));
  if (endpointAccountId && !/^(sua|seu)_?account_?id$/i.test(endpointAccountId)) {
    candidates.push(`https://${endpointAccountId}.r2.cloudflarestorage.com`);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function resolveR2Endpoint() {
  return getR2EndpointCandidates()[0] || "";
}

function isR2CredentialError(error: unknown) {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name || "")
      : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return /SignatureDoesNotMatch|InvalidAccessKeyId|AccessDenied/i.test(name) ||
    /signature.*does not match|invalid access key|access denied/i.test(message);
}

async function sendR2WithFallback<T>(command: any): Promise<T> {
  const endpoints = getR2EndpointCandidates();
  if (endpoints.length === 0) {
    throw new Error("Endpoint R2 não configurado.");
  }

  let lastError: unknown;
  for (const endpoint of endpoints) {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: readEnvValue("R2_ACCESS_KEY_ID"),
        secretAccessKey: readEnvValue("R2_SECRET_ACCESS_KEY"),
      },
    });

    try {
      return await client.send(command) as T;
    } catch (error) {
      lastError = error;
      if (!isR2CredentialError(error)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha de autenticação no armazenamento R2.");
}

function normalizeR2Error(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (isR2CredentialError(error)) {
    return "Falha de autenticação no armazenamento R2. As credenciais configuradas não correspondem à conta do bucket.";
  }
  return raw || "Falha no armazenamento R2.";
}

function buildPublicUrl(_bucket: string, objectKey: string) {
  const base = readEnvValue("R2_PUBLIC_BASE_URL");
  if (base) {
    return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
  }

  // Cloudflare R2 S3 endpoints are private API endpoints, not public asset URLs.
  // When no public base URL is configured, callers must persist objectKey/filePath
  // and request a signed GET URL when the asset is displayed.
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

const OFFICIAL_READ_API_BASE = "https://sigapromunicipal.com.br";

const READ_ONLY_R2_ROUTES = [
  "/api/r2-sign-get",
  "/api/r2-list-user-files",
] as const;

function isReadOnlyR2Route(url: string) {
  return READ_ONLY_R2_ROUTES.some((route) => url.startsWith(route));
}

function isSafeBrandingObjectKey(objectKey: string) {
  return (
    /^platform\/branding\/[a-zA-Z0-9/_-]+\.(png|webp|jpe?g)$/i.test(objectKey) ||
    /^municipalities\/[0-9a-f-]{36}\/branding\/[a-zA-Z0-9/_-]+\.(png|webp|jpe?g)$/i.test(objectKey)
  ) && !objectKey.includes("..");
}

async function proxyOfficialLogoSource(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
) {
  const body = await readJsonBody(req);
  const objectKey = typeof body.objectKey === "string" ? body.objectKey.trim() : "";
  if (!isSafeBrandingObjectKey(objectKey)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Logo inválido.");
    return;
  }

  const signResponse = await fetch(`${OFFICIAL_READ_API_BASE}/api/r2-sign-get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(req.headers.authorization
        ? { Authorization: String(req.headers.authorization) }
        : {}),
    },
    body: JSON.stringify({
      bucket: readEnvValue("R2_BUCKET_LOGOS") || "sigapro-logos",
      objectKey,
      expiresIn: 900,
    }),
  });

  const signPayload = await signResponse.json().catch(() => ({})) as { signedUrl?: string; error?: string };
  if (!signResponse.ok || !signPayload.signedUrl) {
    res.statusCode = signResponse.status || 502;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(signPayload.error || "Não foi possível gerar acesso ao logo.");
    return;
  }

  const imageResponse = await fetch(signPayload.signedUrl, { cache: "no-store" });
  if (!imageResponse.ok) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Não foi possível carregar o logo oficial.");
    return;
  }

  const contentType = imageResponse.headers.get("content-type");
  if (contentType && !contentType.startsWith("image/")) {
    res.statusCode = 415;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("O arquivo de branding não é uma imagem.");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType || "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.end(Buffer.from(await imageResponse.arrayBuffer()));
}

async function proxyOfficialReadApi(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
) {
  const targetPath = req.url || "/";
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : JSON.stringify(await readJsonBody(req));

  const response = await fetch(`${OFFICIAL_READ_API_BASE}${targetPath}`, {
    method: req.method,
    headers: {
      "Content-Type": req.headers["content-type"] || "application/json",
      ...(req.headers.authorization
        ? { Authorization: String(req.headers.authorization) }
        : {}),
    },
    body,
    redirect: "manual",
  });

  res.statusCode = response.status;
  const contentType = response.headers.get("content-type");
  const cacheControl = response.headers.get("cache-control");
  const location = response.headers.get("location");
  if (contentType) res.setHeader("Content-Type", contentType);
  if (cacheControl) res.setHeader("Cache-Control", cacheControl);
  if (location) res.setHeader("Location", location);

  const bytes = Buffer.from(await response.arrayBuffer());
  res.end(bytes);
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

        const isR2ApiRoute = [
          "/api/r2-health",
          "/api/r2-upload",
          "/api/r2-delete",
          "/api/r2-presign",
          "/api/r2-master-logo-source",
          ...READ_ONLY_R2_ROUTES,
        ].some((route) => req.url?.startsWith(route));

        // O middleware de desenvolvimento do R2 não deve sequestrar outras APIs
        // locais (health, auth, integrações etc.). Sem isso, a ausência de R2
        // fazia rotas não relacionadas falharem com "Variáveis R2 ausentes".
        if (!isR2ApiRoute) {
          next();
          return;
        }

        // Desenvolvimento pode validar o R2 de forma independente da produção:
        // - com env R2 completo, /r2-sign-get e o logo são resolvidos localmente;
        // - sem env local, somente leituras são encaminhadas para a API oficial.
        // Upload/delete nunca são encaminhados para produção.
        const localR2Ready = hasCompleteLocalR2Env();

        if (req.url.startsWith("/api/r2-master-logo-source") && !localR2Ready) {
          try {
            await proxyOfficialLogoSource(req, res);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao acessar o logo oficial.";
            console.error("[SIGAPRO][R2] proxy local de logo:", error);
            res.statusCode = 502;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(message);
          }
          return;
        }

        if (req.url.startsWith("/api/r2-list-user-files") || (req.url.startsWith("/api/r2-sign-get") && !localR2Ready)) {
          try {
            await proxyOfficialReadApi(req, res);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao acessar a API oficial de leitura.";
            console.error("[SIGAPRO][R2] proxy local de leitura:", error);
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: message, code: "R2_READ_PROXY_ERROR" }));
          }
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
          if (req.url.startsWith("/api/r2-health")) {
            const bucket = readEnvValue("R2_BUCKET_DOCUMENTOS");
            await sendR2WithFallback(new HeadBucketCommand({ Bucket: bucket }));
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, bucket }));
            return;
          }

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
              accessKeyLength: readEnvValue("R2_ACCESS_KEY_ID").length,
              endpointHost: (() => {
                try { return new URL(resolveR2Endpoint()).host; } catch { return "invalid-endpoint"; }
              })(),
            });

            await sendR2WithFallback(
              new PutObjectCommand({
                Bucket: bucket,
                Key: objectKey,
                Body: buffer,
                ContentType: contentType || "application/octet-stream",
                // Do not send original filenames as signed R2 metadata headers.
                // Accented/localized names can be encoded differently by the HTTP layer
                // and invalidate SigV4. The original filename is persisted in SIGAPRO data.
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

            await sendR2WithFallback(
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

            const presignClient = new S3Client({
              region: "auto",
              endpoint: resolveR2Endpoint(),
              credentials: {
                accessKeyId: readEnvValue("R2_ACCESS_KEY_ID"),
                secretAccessKey: readEnvValue("R2_SECRET_ACCESS_KEY"),
              },
            });
            const uploadUrl = await getSignedUrl(
              presignClient,
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

            const signClient = new S3Client({
              region: "auto",
              endpoint: resolveR2Endpoint(),
              credentials: {
                accessKeyId: readEnvValue("R2_ACCESS_KEY_ID"),
                secretAccessKey: readEnvValue("R2_SECRET_ACCESS_KEY"),
              },
            });
            const signedUrl = await getSignedUrl(
              signClient,
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

          if (req.url.startsWith("/api/r2-master-logo-source")) {
            const objectKey = body?.objectKey;
            if (typeof objectKey !== "string" || !isSafeBrandingObjectKey(objectKey)) {
              res.statusCode = 400;
              res.end("Logo inválido.");
              return;
            }
            const object = await sendR2WithFallback<any>(new GetObjectCommand({
              Bucket: readEnvValue("R2_BUCKET_LOGOS"),
              Key: objectKey,
            }));
            if (!object.Body || (object.ContentLength ?? 0) > 10 * 1024 * 1024) {
              res.statusCode = 413;
              res.end("Logo indisponível ou muito grande.");
              return;
            }
            const bytes = await object.Body.transformToByteArray();
            if (bytes.length > 10 * 1024 * 1024) {
              res.statusCode = 413;
              res.end("Logo muito grande.");
              return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", object.ContentType?.startsWith("image/") ? object.ContentType : "image/png");
            res.setHeader("Cache-Control", "no-store");
            res.end(Buffer.from(bytes));
            return;
          }

          next();
        } catch (error) {
          const message = normalizeR2Error(error);
          console.error("[SIGAPRO][R2] erro rota local:", error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            error: message,
            code: isR2CredentialError(error) ? "R2_CREDENTIAL_MISMATCH" : "R2_ERROR",
          }));
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
  const env = loadDevelopmentEnvWithWorktreeFallback(mode);
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
