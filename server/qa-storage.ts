import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { callDataApiRpc, type ApiReq } from "./municipal-storage.js";

type Res = import("http").ServerResponse;
type Request = ApiReq & { body?: unknown };

const QA_STORAGE_ENDPOINT = "https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech";
const QA_STORAGE_BUCKET = "sigapro-qa-urban-documents";
const QA_REGION = "us-east-2";
const MUNICIPAL_KEY = /^municipalities\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(?:protocols|habite-se|processes|branding|legislation(?:[-/]))[a-zA-Z0-9_./() -]*$/i;

function env(key: string) {
  return String(process.env[key] || "").replace(/^['"]|['"]$/g, "").trim();
}

function isolatedPreview() {
  return process.env.VERCEL_ENV === "preview" &&
    env("VITE_SIGAPRO_NEON_ISOLATED") === "true";
}

export function qaStorageReady(): boolean {
  return isolatedPreview() &&
    env("SIGAPRO_QA_STORAGE_ENDPOINT").replace(/\/+$/, "") === QA_STORAGE_ENDPOINT &&
    env("SIGAPRO_QA_STORAGE_BUCKET") === QA_STORAGE_BUCKET &&
    env("SIGAPRO_QA_STORAGE_REGION") === QA_REGION &&
    env("SIGAPRO_QA_STORAGE_ACCESS_KEY_ID").startsWith("nak_") &&
    env("SIGAPRO_QA_STORAGE_SECRET_ACCESS_KEY").length >= 24;
}

function client(): S3Client {
  if (!qaStorageReady()) throw new Error("QA_STORAGE_NOT_READY");
  return new S3Client({
    region: QA_REGION,
    endpoint: QA_STORAGE_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env("SIGAPRO_QA_STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: env("SIGAPRO_QA_STORAGE_SECRET_ACCESS_KEY"),
    },
  });
}

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function body(req: Request): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += bytes.length;
    if (size > 3 * 1024 * 1024) throw new Error("QA_PAYLOAD_TOO_LARGE");
    chunks.push(bytes);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("QA_INVALID_BODY");
  return parsed as Record<string, unknown>;
}

function validObjectKey(value: unknown) {
  if (typeof value !== "string" || value.length > 850 ||
      value.includes("..") || value.includes("//") || value.includes("\\") ||
      /[\r\n]/.test(value)) return null;
  const match = value.match(MUNICIPAL_KEY);
  return match ? { key: value, municipalityId: match[1] } : null;
}

async function canAccess(req: Request, municipalityId: string, objectKey: string, action: string) {
  const tenant = await callDataApiRpc(req, "has_tenant_access", { target_tenant: municipalityId });
  const truthy = (result: { ok: boolean; payload?: unknown }) =>
    result.ok && (result.payload === true || result.payload === "true");
  if (!truthy(tenant)) return false;

  // A tenant membership alone must NOT grant access to every municipal document.
  const protocolMatch = objectKey.match(
    /^municipalities\/[0-9a-f-]{36}\/(?:protocols|habite-se)\/([A-Za-z0-9_-]+)\//i,
  );
  if (protocolMatch) {
    // A protocol key contains its uploader's own identity, not a process ID.
    // Both values below come from verified Neon Auth RPCs, never client input.
    const [subject, profile] = await Promise.all([
      callDataApiRpc(req, "current_auth_subject", {}),
      callDataApiRpc(req, "current_profile_id", {}),
    ]);
    const subjectId = subject.ok && typeof subject.payload === "string"
      ? subject.payload : "";
    const profileId = profile.ok && typeof profile.payload === "string"
      ? profile.payload : "";
    const principal = protocolMatch[1];
    return Boolean(principal && (principal === subjectId || principal === profileId));
  }
  const processMatch = objectKey.match(
    /^municipalities\/[0-9a-f-]{36}\/processes\/([0-9a-f-]{36})\//i,
  );
  if (processMatch) {
    const processId = processMatch[1];
    const access = await callDataApiRpc(req, "has_process_access", { _process_id: processId });
    if (!truthy(access)) return false;
    if (action === "upload" || action === "delete") {
      const write = await callDataApiRpc(req, "can_write_process_analysis",
        { _process_id: processId });
      return truthy(write);
    }
    return true;
  }

  // Municipal legislation is only editable by a regulation administrator.
  if (/\/legislation(?:[-/])/.test(objectKey)) {
    if (action === "sign-get") return true;
    const admin = await callDataApiRpc(req, "is_urban_regulation_admin_v1",
      { _municipality_id: municipalityId });
    return truthy(admin);
  }

  // Branding and user protocol recovery need specific owner/role authorization.
  return false;
}

function logicalBucketValid(value: unknown, objectKey: string) {
  if (typeof value !== "string") return false;
  const documents = new Set([
    "process-documents", "sigapro-documentos", env("R2_BUCKET_DOCUMENTOS"),
  ]);
  const institutional = new Set([
    "institutional-branding", "sigapro-logos", env("R2_BUCKET_LOGOS"),
  ]);
  // The browser submits logical bucket names; the QA S3 bucket is always
  // pinned to a separate physical bucket, never to these logical names.
  const isLaw = /\/legislation(?:[-/])/.test(objectKey);
  return documents.has(value) || (isLaw && institutional.has(value));
}

export async function handleQaStorage(req: Request, res: Res, action: string) {
  // Never fall back to R2 when the QA S3 credential has not been supplied.
  if (!qaStorageReady()) {
    json(res, 503, { code: "QA_STORAGE_NOT_READY",
      error: "Armazenamento exclusivo de QA ainda sem credencial vinculada." });
    return;
  }
  if (!["upload", "sign-get", "delete", "list-user-files"].includes(action)) {
    json(res, 503, { code: "QA_STORAGE_ACTION_DISABLED",
      error: "Operação indisponível no armazenamento isolado de homologação." });
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { code: "METHOD_NOT_ALLOWED" });
    return;
  }
  if (!/^Bearer\s+\S+$/i.test(String(req.headers?.authorization || ""))) {
    json(res, 401, { code: "QA_STORAGE_UNAUTHENTICATED" });
    return;
  }

  try {
    const input = await body(req);
    if (action === "list-user-files") {
      const context = await callDataApiRpc(req, "get_current_profile_context", {});
      const user = await callDataApiRpc(req, "current_auth_subject", {});
      const detail = context.ok && typeof context.payload === "object" &&
        context.payload && !Array.isArray(context.payload)
        ? context.payload as Record<string, unknown> : null;
      const municipalityId = String(detail?.tenant_id || detail?.municipality_id || "");
      const subject = user.ok && typeof user.payload === "string" ? user.payload : "";
      const profileId = String(detail?.profile_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(municipalityId) ||
          (!/^[A-Za-z0-9_-]+$/.test(subject) && !/^[A-Za-z0-9_-]+$/.test(profileId))) {
        json(res, 403, { code: "QA_STORAGE_FORBIDDEN" }); return;
      }
      const member = await callDataApiRpc(req, "has_tenant_access",
        { target_tenant: municipalityId });
      if (!member.ok || member.payload !== true) {
        json(res, 403, { code: "QA_STORAGE_FORBIDDEN" }); return;
      }
      const processId = typeof input.processId === "string" ? input.processId.trim() : "";
      if (processId) {
        if (!/^[0-9a-f-]{36}$/i.test(processId)) {
          json(res, 400, { code: "QA_INVALID_PROCESS" }); return;
        }
        const access = await callDataApiRpc(req, "has_process_access", { _process_id: processId });
        if (!access.ok || access.payload !== true) {
          json(res, 403, { code: "QA_STORAGE_FORBIDDEN" }); return;
        }
      }
      // Recovery is intentionally restricted to the current user's prefixes.
      // It never enumerates another professional's records, even if an analyst
      // has access to a process that the professional submitted.
      const principals = [...new Set([subject, profileId].filter(
        p => /^[A-Za-z0-9_-]+$/.test(p),
      ))];
      const since = typeof input.since === "string" &&
        !Number.isNaN(Date.parse(input.since))
        ? new Date(input.since) : new Date(Date.now() - 7 * 86400_000);
      const s3 = client();
      const sets = await Promise.all(
        ["protocols", "habite-se"].flatMap(folder =>
          principals.map(principal =>
            s3.send(new ListObjectsV2Command({
              Bucket: QA_STORAGE_BUCKET,
              Prefix: `municipalities/${municipalityId}/${folder}/${principal}/`,
              MaxKeys: 250,
            })),
          ),
        ),
      );
      const files = sets.flatMap(result => result.Contents || [])
        .filter(entry => entry.Key && entry.LastModified && entry.LastModified >= since)
        .filter((entry, index, all) =>
          all.findIndex(other => other.Key === entry.Key) === index)
        .sort((a,b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
        .slice(0, 250)
        .map(entry => ({
          objectKey: entry.Key!,
          fileName: entry.Key!.split("/").at(-1) || "arquivo",
          size: Number(entry.Size || 0),
          lastModified: entry.LastModified!.toISOString(),
        }));
      json(res, 200, { files, storageProvider: "neon_qa" });
      return;
    }
    const scope = validObjectKey(input.objectKey);
    if (!scope || !logicalBucketValid(input.bucket, scope.key)) {
      json(res, 400, { code: "QA_INVALID_STORAGE_TARGET" });
      return;
    }
    if (!(await canAccess(req, scope.municipalityId, scope.key, action))) {
      json(res, 403, { code: "QA_STORAGE_FORBIDDEN" });
      return;
    }
    const s3 = client();
    const bucket = QA_STORAGE_BUCKET;
    const key = scope.key;
    if (action === "upload") {
      const data = typeof input.base64 === "string" ? input.base64 : "";
      if (!data || data.length > 3 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
        json(res, 413, { code: "QA_FILE_INVALID_OR_TOO_LARGE" }); return;
      }
      const bytes = Buffer.from(data, "base64");
      const contentType = typeof input.contentType === "string" ? input.contentType : "";
      if (!bytes.length || bytes.length > 2 * 1024 * 1024 ||
          !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(contentType)) {
        json(res, 413, { code: "QA_FILE_INVALID_OR_TOO_LARGE" }); return;
      }
      if (contentType === "application/pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") {
        json(res, 400, { code: "QA_PDF_INVALID" }); return;
      }
      if (key.includes("/dam-originals/")) {
        json(res, 409, { code: "QA_PAYMENT_ORIGINAL_UPLOAD_DISABLED" }); return;
      }
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key,
        Body: bytes, ContentType: contentType }));
      json(res, 200, { bucket: input.bucket, resolvedBucket: bucket, objectKey: key,
        publicUrl: "", storageProvider: "neon_qa" });
      return;
    }
    if (action === "delete") {
      if (key.includes("/dam-originals/")) {
        json(res, 409, { code: "QA_PAYMENT_ORIGINAL_DELETE_DISABLED" }); return;
      }
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      json(res, 200, { ok: true, bucket: input.bucket, resolvedBucket: bucket, objectKey: key,
        storageProvider: "neon_qa" });
      return;
    }
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const ttl = typeof input.expiresIn === "number" && Number.isFinite(input.expiresIn)
      ? Math.max(60, Math.min(input.expiresIn, 3600)) : 900;
    const signedUrl = await getSignedUrl(s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttl });
    json(res, 200, { signedUrl, bucket: input.bucket, resolvedBucket: bucket, objectKey: key,
      storageProvider: "neon_qa" });
  } catch {
    // Do not reveal S3 access keys, service endpoints, or auth context.
    json(res, 503, { code: "QA_STORAGE_UNAVAILABLE", error: "Armazenamento de QA indisponível." });
  }
}

export async function qaLegislationSignedUrl(objectKey: string) {
  const scope = validObjectKey(objectKey);
  if (!scope || !/\/legislation(?:[-/])/.test(scope.key)) throw new Error("Invalid QA legislation key");
  const s3 = client();
  await s3.send(new HeadObjectCommand({ Bucket: QA_STORAGE_BUCKET, Key: scope.key }));
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: QA_STORAGE_BUCKET, Key: scope.key }),
    { expiresIn: 900 });
}
