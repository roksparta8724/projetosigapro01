import { getR2EndpointCandidates } from "../r2-runtime.js";
import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { authorizePrivateAvatarRead, enforceAuthenticatedAvatarRead } from "../avatar-access.js";

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

const MAX_AVATAR_BYTES = 12 * 1024 * 1024;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

/**
 * Reject oversized R2 objects before allocating their full body. R2 usually
 * sends ContentLength, but untrusted/missing metadata must not bypass the
 * streaming size cap. for-await closes the stream on early return.
 */
export async function readBoundedR2Avatar(
  body: AsyncIterable<Uint8Array>,
  contentLength?: number,
): Promise<Buffer | null> {
  if (typeof contentLength === "number" &&
      (!Number.isFinite(contentLength) || contentLength < 0 ||
       contentLength > MAX_AVATAR_BYTES)) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of body) {
      total += chunk.byteLength;
      if (total > MAX_AVATAR_BYTES) return null;
      chunks.push(Buffer.from(chunk));
    }
  } catch {
    return null;
  }
  return total > 0 ? Buffer.concat(chunks, total) : null;
}

function resolveR2Clients() {
  const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) return [];

  return getR2EndpointCandidates().map(
    (endpoint) =>
      new S3Client({
        region: "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      }),
  );
}

export function parseAvatarRequest(req: Req) {
  const requestUrl = new URL(req.url || "/api/profile-avatar-open", "https://sigapro.local");
  const objectKey = String(requestUrl.searchParams.get("objectKey") || "")
    .trim()
    .replace(/^\/+/, "");

  if (objectKey) {
    const validProfileObject =
      // A mesma lista de caminhos permitidos deve valer no browser e servidor.
      // Não expor os demais arquivos da plataforma (documentos, marcas, etc.).
      /^(?:municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|platform)\/profiles\/avatars\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/i.test(
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
  const allowedHost = /^[a-z0-9-]+\.supabase\.co$/i.test(source.hostname);
  const allowedPath = source.pathname.startsWith("/storage/v1/object/public/avatars/");

  if (
    source.protocol !== "https:" ||
    source.username ||
    source.password ||
    source.port ||
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

/**
 * Archived public avatar URLs can be read from our R2 cache without any
 * outgoing request. Uncached legacy recovery is opt-in for one exact origin:
 * a random *.supabase.co host or an HTTP redirect must never let a public
 * image route become a server-side request proxy.
 *
 * Configure SIGAPRO_LEGACY_AVATAR_SOURCE_ORIGIN to an HTTPS origin after
 * confirming that the historic Supabase project is reachable. Default: off.
 */
export function legacyAvatarNetworkAllowed(source: URL, configuredOrigin: string): boolean {
  if (!configuredOrigin) return false;
  try {
    const allowed = new URL(configuredOrigin);
    return allowed.protocol === "https:" &&
      allowed.port === "" && !allowed.username && !allowed.password &&
      allowed.pathname === "/" && !allowed.search && !allowed.hash &&
      /^[a-z0-9-]+\.supabase\.co$/i.test(allowed.hostname) &&
      source.protocol === "https:" && source.port === "" &&
      source.origin === allowed.origin;
  } catch {
    return false;
  }
}

/** Never serve SVG, HTML or a spoofed image Content-Type as a public avatar. */
export function safeAvatarMime(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.length < 12) return null;
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.toString("ascii",0,6) === "GIF87a" || b.toString("ascii",0,6) === "GIF89a") return "image/gif";
  if (b.toString("ascii",0,4) === "RIFF" && b.toString("ascii",8,12) === "WEBP") return "image/webp";
  if (b.toString("ascii",4,8) === "ftyp" &&
      ["avif","avis"].includes(b.toString("ascii",8,12))) return "image/avif";
  return null;
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

async function streamAvatarFromAnyClient(
  clients: S3Client[],
  bucket: string,
  objectKey: string,
  res: Res,
) {
  for (const client of clients) {
    if (await streamCachedAvatar(client, bucket, objectKey, res)) {
      return true;
    }
  }
  return false;
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
    // Read R2 bodies incrementally. Checking size only after
    // transformToByteArray() would already allocate an oversized object.
    const bytes = await readBoundedR2Avatar(
      object.Body as AsyncIterable<Uint8Array>,
      object.ContentLength,
    );
    if (!bytes) return false;
    const verifiedMime = safeAvatarMime(bytes);
    if (!verifiedMime) return false;

    setCors(res);
    res.statusCode = 200;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", verifiedMime);
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

  const clients = resolveR2Clients();
  try {
  const bucket = readEnv("R2_BUCKET_LOGOS") || "sigapro-logos";

  if (request.kind === "r2") {
    if (enforceAuthenticatedAvatarRead()) {
      const access = await authorizePrivateAvatarRead(req, request.objectKey);
      if (!access.ok) {
        json(res, access.status, { error: access.error });
        return;
      }
      // Never permit cross-origin embedding of authenticated user photos.
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.setHeader("Referrer-Policy", "no-referrer");
    }
    if (!clients.length) {
      json(res, 503, { error: "Armazenamento de fotos indisponível." });
      return;
    }

    if (await streamAvatarFromAnyClient(clients, bucket, request.objectKey, res)) {
      return;
    }

    json(res, 404, { error: "Foto de perfil não encontrada." });
    return;
  }

  const source = request.source;
  const cacheKey = getCacheKey(source);

  if (clients.length && (await streamAvatarFromAnyClient(clients, bucket, cacheKey, res))) {
    return;
  }

  // Do not repeatedly query historic DNS names that have been retired; this
  // prevents SSRF and avoids making an unreachable former provider part of
  // the critical avatar rendering path.
  if (!legacyAvatarNetworkAllowed(source, readEnv("SIGAPRO_LEGACY_AVATAR_SOURCE_ORIGIN"))) {
    json(res, 404, { error: "Foto legada não arquivada. A foto atual no R2 permanece disponível." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    // Keep the deadline active through the entire response body, not only
    // through HTTP headers: a slow stream must not pin a Vercel function.
    const response = await fetch(source.toString(), {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif,image/avif" },
    });

    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || "0");

    if (!response.ok) {
      json(res, response.status === 404 ? 404 : 502, {
        error: "Foto de perfil legada indisponível.",
      });
      return;
    }

    if (!/^(?:image\/png|image\/jpeg|image\/webp|image\/gif|image\/avif)$/i.test(contentType.split(";")[0].trim())) {
      json(res, 415, { error: "O arquivo legado não é uma imagem raster segura." });
      return;
    }

    if (contentLength > MAX_AVATAR_BYTES) {
      json(res, 413, { error: "Foto de perfil muito grande." });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      json(res, 502, { error: "Resposta de foto incompleta." });
      return;
    }
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        totalBytes += part.value.byteLength;
        if (totalBytes > MAX_AVATAR_BYTES) {
          await reader.cancel().catch(() => {});
          json(res, 413, { error: "Foto de perfil inválida ou muito grande." });
          return;
        }
        chunks.push(Buffer.from(part.value));
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks, totalBytes);
    const verifiedMime = safeAvatarMime(bytes);
    if (!verifiedMime || !bytes.length) {
      json(res, 415, { error: "A foto antiga não contém uma imagem raster válida." });
      return;
    }

    if (clients.length) {
      let cached = false;
      let lastCacheError: unknown = null;
      for (const client of clients) {
        try {
          await client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: cacheKey,
              Body: bytes,
              ContentType: verifiedMime,
              CacheControl: "private, max-age=21600",
            }),
          );
          cached = true;
          break;
        } catch (error) {
          lastCacheError = error;
        }
      }
      if (!cached && lastCacheError) {
        console.warn("[SIGAPRO][AvatarLegacy] Não foi possível cachear a foto no R2.", {
          cacheKey,
          error: lastCacheError,
        });
      }
    }

    setCors(res);
    res.statusCode = 200;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", verifiedMime);
    res.setHeader("Cache-Control", "private, max-age=21600, stale-while-revalidate=86400");
    res.end(bytes);
  } catch {
    // Never emit old source URLs, raw provider errors or user identifiers.
    console.warn("[SIGAPRO][AvatarLegacy] Fonte antiga indisponível; referência R2 preservada.");
    json(res, 502, { error: "Foto antiga temporariamente indisponível. O cadastro continua preservado." });
  } finally {
    clearTimeout(timeout);
  }
  } finally {
    for (const client of clients) client.destroy();
  }
}
