import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function getR2EndpointCandidates() {
  const candidates: string[] = [];

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

function resolveR2Client() {
  const endpoint = getR2EndpointCandidates()[0] || "";
  const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");

  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function parseAvatarRequest(req: Req) {
  const requestUrl = new URL(req.url || "/api/profile-avatar-open", "https://sigapro.local");
  const objectKey = String(requestUrl.searchParams.get("objectKey") || "")
    .trim()
    .replace(/^\/+/, "");

  if (objectKey) {
    const validProfileObject =
      /^municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/profiles\/avatars\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/i.test(
        objectKey,
      );
    if (!validProfileObject) {
      throw new Error("Chave da foto de perfil inválida.");
    }
    return { kind: "r2" as const, objectKey };
  }

  const raw = requestUrl.searchParams.get("source") || "";
  if (!raw) throw new Error("Origem da foto não informada.");

  const source = new URL(raw);
  const allowedHost = /(^|\.)supabase\.co$/i.test(source.hostname);
  const allowedPath = source.pathname.startsWith("/storage/v1/object/public/avatars/");

  if (
    source.protocol !== "https:" ||
    source.username ||
    source.password ||
    !allowedHost ||
    !allowedPath
  ) {
    throw new Error("Origem da foto de perfil inválida.");
  }

  return { kind: "legacy" as const, source };
}

function resolveExtension(source: URL) {
  const match = /\.([a-z0-9]{2,5})$/i.exec(source.pathname);
  const ext = match?.[1]?.toLowerCase() || "img";
  return ["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext) ? ext : "img";
}

function getCacheKey(source: URL) {
  const stableIdentity = `${source.hostname}${source.pathname}`;
  const digest = createHash("sha256").update(stableIdentity).digest("hex");
  return `legacy-profile-avatars/${digest}.${resolveExtension(source)}`;
}

function setCors(res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res: Res, status: number, body: unknown) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function streamCachedAvatar(
  client: S3Client,
  bucket: string,
  objectKey: string,
  res: Res,
) {
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    );

    if (!object.Body) return false;
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) return false;

    setCors(res);
    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      object.ContentType?.startsWith("image/") ? object.ContentType : "image/jpeg",
    );
    res.setHeader("Cache-Control", "private, max-age=21600, stale-while-revalidate=86400");
    res.end(bytes);
    return true;
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name || "")
        : "";
    if (/NoSuchKey|NotFound|404/i.test(name)) return false;
    return false;
  }
}

export default async function handler(req: Req, res: Res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "Método não permitido." });
    return;
  }

  let request:
    | { kind: "r2"; objectKey: string }
    | { kind: "legacy"; source: URL };
  try {
    request = parseAvatarRequest(req);
  } catch (error) {
    json(res, 400, {
      error: error instanceof Error ? error.message : "Origem de avatar inválida.",
    });
    return;
  }

  const client = resolveR2Client();
  const bucket = readEnv("R2_BUCKET_LOGOS") || "sigapro-logos";

  if (request.kind === "r2") {
    if (!client) {
      json(res, 503, { error: "Armazenamento de fotos indisponível." });
      return;
    }

    if (await streamCachedAvatar(client, bucket, request.objectKey, res)) {
      return;
    }

    json(res, 404, { error: "Foto de perfil não encontrada." });
    return;
  }

  const source = request.source;
  const cacheKey = getCacheKey(source);

  if (client && (await streamCachedAvatar(client, bucket, cacheKey, res))) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(source.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "image/*" },
    });
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || "0");

    if (!response.ok) {
      json(res, response.status === 404 ? 404 : 502, {
        error: "Foto de perfil legada indisponível.",
      });
      return;
    }

    if (!contentType.toLowerCase().startsWith("image/")) {
      json(res, 415, { error: "O arquivo legado não é uma imagem válida." });
      return;
    }

    if (contentLength > MAX_AVATAR_BYTES) {
      json(res, 413, { error: "Foto de perfil muito grande." });
      return;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) {
      json(res, 413, { error: "Foto de perfil inválida ou muito grande." });
      return;
    }

    if (client) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: cacheKey,
            Body: bytes,
            ContentType: contentType,
            CacheControl: "private, max-age=21600",
          }),
        );
      } catch (error) {
        console.warn("[SIGAPRO][AvatarLegacy] Não foi possível cachear a foto no R2.", {
          cacheKey,
          error,
        });
      }
    }

    setCors(res);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=21600, stale-while-revalidate=86400");
    res.end(bytes);
  } catch (error) {
    console.error("[SIGAPRO][AvatarLegacy] Falha ao recuperar foto antiga.", error);
    json(res, 502, { error: "Não foi possível recuperar a foto de perfil." });
  }
}
