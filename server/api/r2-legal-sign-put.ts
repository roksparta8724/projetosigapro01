import type { IncomingMessage, ServerResponse } from "node:http";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { callDataApiRpc, readBearer, resolveMunicipalDocumentTarget } from "../municipal-storage.js";
import { resolveR2Endpoint } from "../r2-runtime.js";

type Req = IncomingMessage & { body?: unknown; method?: string };
type Res = ServerResponse;
const ONE_MIB = 1024 * 1024;
export const MAX_OFFICIAL_LEGAL_PDF_BYTES = 100 * ONE_MIB;
const PDF_BUCKET = "process-documents";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const LEGAL_KEY = new RegExp(
  "^municipalities/(" + UUID + ")/legislation-(?:plano-diretor|uso-solo|zoneamento|leis-complementares|registry)/" +
  "([A-Za-z0-9_-]{3,128})/(" + UUID + ")-([A-Za-z0-9._-]{1,200}\\.pdf)$", "i",
);
function env(key: string) {
  return String(process.env[key] || "").trim().replace(/^['"]|['"]$/g, "");
}
function json(res: Res, status: number, result: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(result));
}
function booleanResult(value: unknown): boolean {
  return value === true || value === "true";
}
export function validateLegalUploadInput(body: unknown) {
  const b = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown> : null;
  if (!b || (b.action !== "sign" && b.action !== "verify" && b.action !== "diagnose") ||
    b.bucket !== PDF_BUCKET || b.contentType !== "application/pdf" ||
    typeof b.objectKey !== "string" || b.objectKey.length > 500 ||
    !Number.isSafeInteger(b.fileSize) || Number(b.fileSize) < 5 ||
    Number(b.fileSize) > MAX_OFFICIAL_LEGAL_PDF_BYTES) return null;
  const match = LEGAL_KEY.exec(b.objectKey);
  return match ? {
    action: b.action as "sign" | "verify" | "diagnose",
    municipalityId: match[1].toLowerCase(),
    objectKey: b.objectKey,
    fileSize: Number(b.fileSize),
    registryUpload: /\/legislation-registry\//i.test(b.objectKey),
  } : null;
}
async function readBody(req: Req): Promise<unknown> {
  if (req.body !== undefined) return req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function sameOrigin(req: Req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = String(req.headers.host || "").toLowerCase();
    return parsed.host.toLowerCase() === host &&
      (parsed.protocol === "https:" || (parsed.protocol === "http:" &&
        /^localhost(?::|$)/.test(host)));
  } catch { return false; }
}
type LegalUploadGate =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

async function authorize(req: Req, municipalityId: string, fileSize: number): Promise<LegalUploadGate> {
  // Signed uploads are tenant-scoped. Never fall back to Master permissions.
  const grant = await callDataApiRpc<unknown>(req,
    "can_manage_urban_legislation_registry_v1", { _municipality_id: municipalityId });
  if (!grant.ok) {
    const unavailable = grant.status === 404 ||
      /PGRST202|schema cache|could not find|does not exist/i.test(grant.error);
    return unavailable
      ? { ok: false, status: 503, code: "LEGAL_AUTH_SCHEMA_MISSING",
          error: "A autorização de legislação não está instalada no banco deste ambiente. Sincronize a migração da homologação antes de enviar PDFs." }
      : { ok: false, status: grant.status === 401 ? 401 : grant.status === 403 ? 403 : 503,
          code: "LEGAL_AUTH_UNAVAILABLE",
          error: "Não foi possível verificar a autorização municipal para cadastrar a legislação." };
  }
  if (!booleanResult(grant.payload)) {
    return { ok: false, status: 403, code: "LEGAL_ROLE_DENIED",
      error: "Esta conta não está autorizada a cadastrar legislação nesta Prefeitura. Confirme o vínculo do Admin da Prefeitura com este município." };
  }
  const allowance = await callDataApiRpc(req, "assert_municipality_entitlement_v1", {
    _municipality_id: municipalityId,
    _capability: "storage_bytes",
    _increment: fileSize,
  });
  if (!allowance.ok) {
    if (allowance.status === 409 || /limite|franquia|quota|exced/i.test(allowance.error)) {
      return { ok: false, status: 409, code: "STORAGE_LIMIT",
        error: "O armazenamento contratado pela Prefeitura não comporta este PDF. Confira o limite do plano, sem alterar a legislação já salva." };
    }
    return { ok: false, status: allowance.status === 403 ? 403 : 503,
      code: "STORAGE_CHECK_UNAVAILABLE",
      error: "Não foi possível validar a franquia de armazenamento da Prefeitura neste ambiente. O problema não comprova limite excedido." };
  }
  return { ok: true };
}
export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });
  if (!sameOrigin(req)) return json(res, 403, { error: "Origem não autorizada." });
  if (!readBearer(req)) return json(res, 401, { error: "Sessão SIGAPRO necessária." });
  let input;
  try { input = validateLegalUploadInput(await readBody(req)); }
  catch { return json(res, 400, { error: "Solicitação inválida." }); }
  if (!input) return json(res, 400, {
    error: "Somente PDF oficial de legislação, até 100 MB, com chave municipal válida.",
  });
  const gate = await authorize(req, input.municipalityId, input.fileSize);
  if (gate.ok === false) return json(res, gate.status, { code: gate.code, error: gate.error });
  try {
    const target = await resolveMunicipalDocumentTarget(req, input.municipalityId,
      env("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos", input.objectKey);
    const bucket = target?.bucket || env("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
    const key = target?.objectKey || input.objectKey;
    const client = target?.client || new S3Client({
      region: "auto",
      endpoint: resolveR2Endpoint(),
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      },
    });
    if (!target && (!env("R2_ACCESS_KEY_ID") || !env("R2_SECRET_ACCESS_KEY"))) {
      return json(res, 503, { error: "Armazenamento institucional indisponível." });
    }
    if (input.action === "sign") {
      // Never route PDF bytes through Vercel; signed for one object, five minutes.
      // IfNoneMatch prevents a previously archived revision from being overwritten.
      const url = await getSignedUrl(client, new PutObjectCommand({
        Bucket: bucket, Key: key, ContentType: "application/pdf", IfNoneMatch: "*",
      }), { expiresIn: 300 });
      return json(res, 200, { uploadUrl: url, objectKey: input.objectKey,
        requiredHeaders: { "Content-Type": "application/pdf", "If-None-Match": "*" } });
    }
    if (input.action === "diagnose") {
      // Safe, read-only CORS preflight against the exact signed R2 target.
      // Do not echo the signed URL or its query parameters to the client.
      const origin = String(req.headers.origin || "https://" + req.headers.host);
      const url = await getSignedUrl(client, new PutObjectCommand({
        Bucket: bucket, Key: key, ContentType: "application/pdf", IfNoneMatch: "*",
      }), { expiresIn: 120 });
      try {
        const probe = await fetch(url, {
          method: "OPTIONS", redirect: "manual",
          headers: {
            Origin: origin,
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type,if-none-match",
          },
          signal: AbortSignal.timeout(8000),
        });
        const allowedOrigin = probe.headers.get("access-control-allow-origin") || "";
        const allowedMethods = probe.headers.get("access-control-allow-methods") || "";
        const allowedHeaders = probe.headers.get("access-control-allow-headers") || "";
        const allowed = (allowedOrigin === origin || allowedOrigin === "*") &&
          allowedMethods.split(",").some((v) => v.trim().toUpperCase() === "PUT") &&
          ["content-type", "if-none-match"].every((h) =>
            allowedHeaders.split(",").some((v) => v.trim().toLowerCase() === h || v.trim() === "*"));
        return json(res, 200, {
          diagnosis: allowed ? "R2_CORS_PREFLIGHT_OK" : "R2_CORS_PREFLIGHT_DENIED",
          httpStatus: probe.status,
          // The bucket is not necessarily SIGAPRO R2 when BYOS is enabled.
          storage: target ? "municipal_s3" : "sigapro_r2",
          requestedOrigin: origin,
        });
      } catch {
        return json(res, 200, {
          diagnosis: "R2_PREFLIGHT_UNAVAILABLE",
          storage: target ? "municipal_s3" : "sigapro_r2",
          requestedOrigin: origin,
        });
      }
    }
    // A response from PUT is not enough: confirm bytes stored match the
    // declared original before allowing the UI to save the permanent reference.
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (result.ContentLength !== input.fileSize || result.ContentType !== "application/pdf") {
      return json(res, 409, { error: "A verificação do PDF armazenado não corresponde ao arquivo original." });
    }
    return json(res, 200, { ok: true, objectKey: input.objectKey, publicUrl: "" });
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
    return json(res, status === 404 ? 409 : 502, {
      error: status === 404
        ? "Arquivo ainda não encontrado no armazenamento."
        : "Não foi possível autenticar ou verificar o envio do documento ao armazenamento.",
    });
  }
}
