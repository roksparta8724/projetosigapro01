import { execFileSync } from "node:child_process";
import dns from "node:dns";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { checkMercadoPagoConnection, createMercadoPagoGuideBoleto, getMercadoPagoGuideBoletoStatus } from "./server/mercadopago";
import collectionConfigurationHandler from "./api/collection-configuration";
import paymentConnectionHandler from "./api/payment-connection";
import { handleQaDocumentRequest } from "./server/qa-document-store";
import { qaMercadoPagoPix } from "./server/qa-mercadopago-pix";
import { callDataApiRpc } from "./server/municipal-storage";
import handleProfileAvatarOpen from "./server/api/profile-avatar-open";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

dns.setDefaultResultOrder("verbatim");

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

function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !readEnvValue(key));
  if (missing.length > 0) {
    throw new Error(`Variáveis R2 ausentes: ${missing.join(", ")}`);
  }
}

function getR2EndpointCandidates() {
  const candidates: string[] = [];

  const rawEndpoint = readEnvValue("R2_ENDPOINT");
  if (rawEndpoint) {
    try {
      const url = new URL(/^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`);
      candidates.push(`${url.protocol}//${url.host}`);
    } catch {
      candidates.push(rawEndpoint.replace(/\/+$/, ""));
    }
  }

  const accountId = readEnvValue("R2_ACCOUNT_ID")
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

function resolveRequestedR2Bucket(value: unknown) {
  if (typeof value !== "string") return "";
  const logos = readEnvValue("R2_BUCKET_LOGOS");
  const documents = readEnvValue("R2_BUCKET_DOCUMENTOS");

  if (value === "process-documents") return documents;
  if (value === "institutional-branding" || value === "profile-assets") return logos;
  if (value === documents || value === logos) return value;
  return "";
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

function readGitIdentity() {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return { branch, sha };
  } catch {
    return { branch: "unknown", sha: "unknown" };
  }
}

function createR2DevApiPlugin(): Plugin {
  return {
    name: "sigapro-r2-dev-api",
    configureServer(server) {
      const gitIdentity = readGitIdentity();
      console.log("");
      console.log("[SIGAPRO][DEV SOURCE]");
      console.log(`  pasta : ${process.cwd()}`);
      console.log(`  branch: ${gitIdentity.branch}`);
      console.log(`  commit: ${gitIdentity.sha}`);
      console.log("  porta : " + (process.env.SIGAPRO_LOCAL_QA_LAUNCH === "true" ? "8081 QA" : "8080 (strict)"));
      console.log("");

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.method || !req.url.startsWith("/api/")) {
          next();
          return;
        }

        // Intercept only localhost:8081's isolated document repository.
        // Uploads never use R2 credentials. Signed reads only access local QA files.
        if (await handleQaDocumentRequest(req, res)) return;

        // Independent PIX sandbox order, never a municipal PIX key and never
        // the production payment endpoint. Both read and issue require auth.
        if ((req.url || "").split("?")[0] === "/api/qa/mercadopago/guide-pix" && req.method === "POST") {
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          try {
            const body=await readJsonBody(req);
            const result=await qaMercadoPagoPix(req,{
              municipalityId:String(body.municipalityId||""),
              guideCode:String(body.guideCode||""),
              action:body.action==="get" ? "get" : "issue",
            });
            res.statusCode=result.ok?200:422;
            res.end(JSON.stringify(result));
          } catch(error) {
            res.statusCode=400;
            res.end(JSON.stringify({ok:false,sandboxOnly:true,error:error instanceof Error?error.message:"Falha no PIX de homologação."}));
          }
          return;
        }

        // Dedicated test-only billing endpoint. Unlike production billing,
        // this allows ONLY a Mercado Pago TEST order for an existing Neon QA
        // guide, with caller authorization and immutable guide amount.
        if ((req.url || "").split("?")[0] === "/api/qa/mercadopago/guide-boleto" && req.method === "POST") {
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          if (
            process.env.SIGAPRO_LOCAL_QA_LAUNCH !== "true" ||
            process.env.SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES !== "true" ||
            process.env.VITE_SIGAPRO_NEON_ISOLATED !== "true"
          ) {
            res.statusCode = 403;
            res.end(JSON.stringify({ok:false,error:"Emissão de teste indisponível fora do QA isolado."}));
            return;
          }
          try {
            const body = await readJsonBody(req);
            const result = await createMercadoPagoGuideBoleto({
              municipalityId: String(body.municipalityId || ""),
              guideCode: String(body.guideCode || ""),
              amount: Number(body.amount || 0),
              description: "SIGAPRO — boleto de HOMOLOGAÇÃO (não efetuar pagamento)",
            }, req, { isolatedSandboxOnly: true });
            res.statusCode = result.ok ? 200 : 422;
            res.end(JSON.stringify({ ...result, sandboxOnly:true }));
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({
              ok: false, sandboxOnly: true,
              error: error instanceof Error ? error.message : "Falha na emissão do boleto de teste.",
            }));
          }
          return;
        }

        // Explicit local QA may use copied municipal settings, but MUST NOT
        // generate external charges, send a PIX to a provider, or write to a
        // production R2 bucket with inherited local machine credentials.
        if (process.env.SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES === "true" &&
          ["/api/mercadopago/guide-boleto", "/api/mercadopago/guide-status", "/api/r2-upload",
           "/api/r2-delete", "/api/r2-presign", "/api/e-sign-artifact"]
            .some((blocked) => (req.url || "").startsWith(blocked))) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "Homologação isolada: envio ao R2, assinatura e emissão de cobrança externa bloqueados. Configure credenciais e bucket exclusivos de sandbox antes de testar transações." }));
          return;
        }

        if (req.url.startsWith("/api/dev-source")) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({
            app: "SIGAPRO",
            cwd: process.cwd(),
            branch: gitIdentity.branch,
            sha: gitIdentity.sha,
            pid: process.pid,
            port: process.env.SIGAPRO_LOCAL_QA_LAUNCH === "true" ? 8081 : 8080,
            neonEnvironment: process.env.SIGAPRO_LOCAL_QA_LAUNCH === "true" ? "isolated-qa" : "official",
          }));
          return;
        }

        if (req.url.startsWith("/api/legislation-open") && req.method === "GET") {
          try {
            assertEnv();
            const requestUrl = new URL(req.url, "http://localhost:8080");
            const objectKey = String(requestUrl.searchParams.get("objectKey") || "")
              .trim()
              .replace(/^\/+/, "");

            const isMunicipalLegislationObject =
              /^municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/legislation(?:[-/]|$)/i.test(
                objectKey,
              );

            if (!objectKey || !isMunicipalLegislationObject) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.setHeader("Cache-Control", "no-store");
              res.end("Documento de legislação inválido.");
              return;
            }

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
                Bucket: readEnvValue("R2_BUCKET_DOCUMENTOS"),
                Key: objectKey,
                ResponseContentDisposition: "inline",
                ResponseContentType: "application/pdf",
              }),
              { expiresIn: 900 },
            );

            res.statusCode = 302;
            res.setHeader("Location", signedUrl);
            res.setHeader("Cache-Control", "no-store, max-age=0");
            res.end();
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(
              error instanceof Error
                ? `Não foi possível abrir o documento: ${error.message}`
                : "Não foi possível abrir o documento.",
            );
          }
          return;
        }

        if (req.url.startsWith("/api/payment-connection") && req.method === "POST") {
          await paymentConnectionHandler(req, res);
          return;
        }

        if (req.url.startsWith("/api/collection-configuration") && req.method === "POST") {
          await collectionConfigurationHandler(req, res);
          return;
        }

        if (req.url.startsWith("/api/mercadopago/health") && req.method === "GET") {
          const requestUrl = new URL(req.url, "http://localhost:8080");
          const municipalityId = requestUrl.searchParams.get("municipalityId");
          const result = await checkMercadoPagoConnection(req, municipalityId);
          res.statusCode = result.ok ? 200 : result.configured ? 502 : 503;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(result));
          return;
        }

        if (req.url.startsWith("/api/mercadopago/guide-boleto") && req.method === "POST") {
          const body = await readJsonBody(req);
          const result = await createMercadoPagoGuideBoleto({
            municipalityId: body.municipalityId ? String(body.municipalityId) : undefined,
            guideCode: String(body.guideCode || ""),
            amount: Number(body.amount || 0),
            dueDate: body.dueDate ? String(body.dueDate) : undefined,
            description: body.description ? String(body.description) : undefined,
          }, req);

          // Persistência V13 centralizada em server/mercadopago.ts (local e API).
          res.statusCode = result.ok ? 201 : 400;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(result));
          return;
        }

        if (req.url.startsWith("/api/mercadopago/guide-status") && req.method === "POST") {
          const body = await readJsonBody(req);
          const result = await getMercadoPagoGuideBoletoStatus({
            municipalityId: body.municipalityId ? String(body.municipalityId) : undefined,
            orderId: String(body.orderId || ""),
            guideCode: String(body.guideCode || ""),
            amount: Number(body.amount || 0),
          }, req);

          // Persistência V13 centralizada em server/mercadopago.ts (local e API).
          res.statusCode = result.ok ? 200 : 400;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(result));
          return;
        }

        if (req.url.startsWith("/api/e-sign-artifact") && req.method === "POST") {
          // Em localhost, assinatura SEMPRE usa o endpoint oficial do SIGAPRO.
          // Isso elimina divergência de secret, banco, Neon Auth ou função antiga
          // entre VS Code e Vercel.
          const body = await readJsonBody(req);
          const targetBase =
            readEnvValue("SIGAPRO_SIGNATURE_DEV_PROXY") ||
            "https://sigapromunicipal.com.br";
          const targetUrl = new URL("/api/e-sign-artifact", targetBase);
          const authorization = String(req.headers.authorization || "");

          const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Origin: targetUrl.origin,
              ...(authorization ? { Authorization: authorization } : {}),
            },
            body: JSON.stringify(body),
          });

          const responseBody = await response.text();
          let responsePayload: unknown = null;
          try {
            responsePayload = responseBody ? JSON.parse(responseBody) : {};
          } catch {
            responsePayload = null;
          }

          if (!response.ok) {
            const source =
              responsePayload && typeof responsePayload === "object"
                ? (responsePayload as Record<string, unknown>)
                : {};
            const nestedError =
              source.error && typeof source.error === "object"
                ? (source.error as Record<string, unknown>)
                : {};
            const message =
              (typeof source.error === "string" && source.error) ||
              (typeof source.message === "string" && source.message) ||
              (typeof nestedError.message === "string" && nestedError.message) ||
              (typeof nestedError.code === "string" && nestedError.code) ||
              (response.status === 401 || response.status === 403
                ? "A assinatura foi bloqueada pelo ambiente remoto antes de chegar ao SIGAPRO."
                : "Falha no serviço remoto de assinatura.");

            res.statusCode = response.status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify({
              error: String(message),
              stage: "dev_proxy",
              code: `HTTP_${response.status}`,
            }));
            return;
          }

          res.statusCode = response.status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(
            responsePayload && typeof responsePayload === "object"
              ? JSON.stringify(responsePayload)
              : responseBody,
          );
          return;
        }

        if (req.url.startsWith("/api/profile-avatar-open") && req.method === "GET") {
          // Mesma implementação do Vercel: suporta objectKey R2 e source legado.
          // O handler antigo do localhost somente aceitava "source" e devolvia
          // 502 para a foto recém-gravada no Neon, causando sumiço após F5.
          await handleProfileAvatarOpen(req, res);
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
            const { objectKey, contentType, base64, fileName } = body ?? {};
            const requestedBucket = body?.bucket;
            const bucket = resolveRequestedR2Bucket(requestedBucket);

            if (!bucket) {
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
            const { objectKey } = body ?? {};
            const requestedBucket = body?.bucket;
            const bucket = resolveRequestedR2Bucket(requestedBucket);

            if (!bucket) {
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
            const { objectKey, contentType } = body ?? {};
            const requestedBucket = body?.bucket;
            const bucket = resolveRequestedR2Bucket(requestedBucket);

            if (!bucket) {
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
            const { objectKey, expiresIn } = body ?? {};
            const requestedBucket = body?.bucket;
            const bucket = resolveRequestedR2Bucket(requestedBucket);

            if (!bucket) {
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
            if (typeof objectKey !== "string" ||
              !/^platform\/branding\/[a-zA-Z0-9/_-]+\.(png|webp|jpe?g)$/i.test(objectKey) ||
              objectKey.includes("..")) {
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
  // Keep the explicit, public QA Auth/Data pairing supplied by npm run dev:qa,
  // even when the developer's .env contains older production settings.
  const isolatedQa = process.env.SIGAPRO_LOCAL_QA_LAUNCH === "true";
  const pinnedQa = isolatedQa ? {
    VITE_BACKEND: "neon",
    NODE_ENV: "development",
    VERCEL_ENV: "development",
    VITE_SIGAPRO_NEON_ISOLATED: process.env.VITE_SIGAPRO_NEON_ISOLATED,
    VITE_NEON_AUTH_URL: process.env.VITE_NEON_AUTH_URL,
    VITE_NEON_DATA_API_URL: process.env.VITE_NEON_DATA_API_URL,
    VITE_SIGAPRO_QA_READINESS_BANNER: process.env.VITE_SIGAPRO_QA_READINESS_BANNER,
    SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES: process.env.SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES,
    // Re-pin the dedicated private QA encryption key after loadEnv: older
    // production .env entries must never override it.
    MUNICIPAL_PAYMENT_MASTER_KEY: process.env.MUNICIPAL_PAYMENT_MASTER_KEY,
  } : null;
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
  if (pinnedQa) {
    for (const [key, value] of Object.entries(pinnedQa)) {
      if (value !== undefined) process.env[key] = value;
    }
  }

  return {
  server: {
    host: "localhost",
    port: 8080,
    strictPort: true,
    headers: {
      "Cache-Control": "no-store",
    },
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/pages/saas/ProcessDetailPage.tsx",
        "./src/components/platform/PortalFrame.tsx",
        "./src/components/platform/UrbanAnalysisChecklistPanel.tsx",
        "./src/hooks/useAppBootstrap.tsx",
        "./src/hooks/usePlatformData.tsx",
        "./src/hooks/usePlanEntitlements.ts",
        "./src/hooks/usePlatformSession.tsx",
      ],
    },
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
