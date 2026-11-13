/**
 * SIGAPRO: bounded same-origin transport for large municipal process attachments.
 *
 * Upload only an authenticated user's own, newly named document revisions.
 * Stage chunks privately, verify their hashes, assemble by S3 multipart with
 * create-once semantics, and never return a public URL. The browser NEVER
 * sends more than 2 MiB of original file data to a Vercel function per call.
 *
 * Also supports the strictly canonical SHA-named original DAM PDF, but ONLY
 * after the same scoped bank-original RPC authorization as a small upload.
 * Payment receipts, signatures, avatars, and legislation stay separate.
 */
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand, DeleteObjectsCommand, GetObjectCommand,
  HeadObjectCommand, PutObjectCommand, S3Client, UploadPartCommand,
} from "@aws-sdk/client-s3";
import { callDataApiRpc, readBearer, resolveMunicipalDocumentTarget } from "../municipal-storage.js";
import { authorizeProcessAttachmentWrite } from "../process-attachment-write-authorization.js";
import { resolveR2Endpoint } from "../r2-runtime.js";
import { isSafeR2ObjectKey } from "../r2-object-key-validation.js";
import { assertStoredDamOriginal, DAM_ORIGINAL_KEY, DAM_ORIGINAL_MAX_BYTES } from "../dam-original-integrity.js";

type Req = IncomingMessage & { body?: unknown; method?: string };
type Res = ServerResponse;
export const PROCESS_CHUNK_BYTES = 2 * 1024 * 1024;
export const MAX_PROCESS_ATTACHMENT_BYTES = 40 * 1024 * 1024;
const MIN_S3_PART = 5 * 1024 * 1024;
const MAX_JSON_BODY = 3_200_000;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_RX = new RegExp("^" + UUID + "$", "i");
const HEX_RX = /^[a-f0-9]{64}$/i;
const PROCESS_KEY = new RegExp(
  "^municipalities/(" + UUID + ")/(protocols|habite-se|attachments|analysis|documents|comunique-se|qa-arquitetura)/(" +
  UUID + ")/(" + UUID + ")-([a-zA-Z0-9._-]{1,180})$", "i",
);
const FILE_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const MAX_CHUNKS = Math.ceil(MAX_PROCESS_ATTACHMENT_BYTES / PROCESS_CHUNK_BYTES);

function env(key: string): string {
  return String(process.env[key] || "").trim().replace(/^['"]|['"]$/g, "");
}
function respond(res: Res, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}
function sameOrigin(req: Req): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = String(req.headers.host || "").toLowerCase();
    return u.host.toLowerCase() === host &&
      (u.protocol === "https:" || (u.protocol === "http:" && /^localhost(?::|$)/.test(host)));
  } catch { return false; }
}
async function jsonBody(req: Req): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body !== "object" || !req.body || Array.isArray(req.body) ||
      JSON.stringify(req.body).length > MAX_JSON_BODY) throw Error("INVALID_REQUEST");
    return req.body;
  }
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const part of req) {
    const data = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += data.length;
    if (bytes > MAX_JSON_BODY) throw Error("BODY_LIMIT_EXCEEDED");
    chunks.push(data);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("INVALID_JSON");
  return parsed;
}
export type ProcessChunkPayload = {
  action: "chunk" | "finalize" | "abort";
  bucket: "process-documents";
  municipalityId: string;
  actorId: string;
  objectKey: string;
  uploadId: string;
  fileSize: number;
  contentType: string;
  count: number;
  index: number | null;
  base64: string | null;
  chunkSha256: string | null;
  fileSha256: string | null;
  damOriginal: null | { processId:string; guideId:string; sha256:string };
};
export function validateProcessChunkPayload(raw: unknown): ProcessChunkPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (v.bucket !== "process-documents" ||
      (v.action !== "chunk" && v.action !== "finalize" && v.action !== "abort") ||
      typeof v.objectKey !== "string" || !isSafeR2ObjectKey(v.objectKey) ||
      typeof v.uploadId !== "string" || !UUID_RX.test(v.uploadId) ||
      typeof v.fileSize !== "number" || !Number.isSafeInteger(v.fileSize) ||
      v.fileSize <= PROCESS_CHUNK_BYTES || v.fileSize > MAX_PROCESS_ATTACHMENT_BYTES) return null;
  const key = PROCESS_KEY.exec(v.objectKey);
  const dam = DAM_ORIGINAL_KEY.exec(v.objectKey);
  if (!key && !dam) return null;
  const ext = key ? (key[5].split(".").pop()?.toLowerCase() || "") : "pdf";
  const mime = FILE_MIME[ext];
  if (!mime || mime !== v.contentType ||
      (dam && (v.fileSize > DAM_ORIGINAL_MAX_BYTES || mime !== "application/pdf"))) return null;
  const count = Math.ceil(v.fileSize / PROCESS_CHUNK_BYTES);
  if (!count || count > MAX_CHUNKS) return null;
  if (v.action === "chunk") {
    if (!Number.isInteger(v.chunkIndex) || Number(v.chunkIndex) < 0 ||
        Number(v.chunkIndex) >= count || typeof v.base64 !== "string" ||
        v.base64.length > Math.ceil(PROCESS_CHUNK_BYTES / 3) * 4 + 12 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(v.base64) ||
        typeof v.chunkSha256 !== "string" || !HEX_RX.test(v.chunkSha256)) return null;
  } else if (v.action === "finalize") {
    if (typeof v.fileSha256 !== "string" || !HEX_RX.test(v.fileSha256) ||
        (dam && v.fileSha256.toLowerCase() !== dam[4].toLowerCase())) return null;
  }
  return {
    action: v.action,
    bucket: "process-documents",
    municipalityId: String(key?.[1] || dam?.[1]).toLowerCase(),
    actorId: String(key?.[3] || dam?.[3]).toLowerCase(),
    objectKey: v.objectKey,
    uploadId: v.uploadId.toLowerCase(),
    fileSize: v.fileSize,
    contentType: mime,
    count,
    index: v.action === "chunk" ? Number(v.chunkIndex) : null,
    base64: v.action === "chunk" ? String(v.base64) : null,
    chunkSha256: v.action === "chunk" ? String(v.chunkSha256).toLowerCase() : null,
    fileSha256: v.action === "finalize" ? String(v.fileSha256).toLowerCase() : null,
    damOriginal: dam ? {
      processId: dam[2].toLowerCase(),
      guideId: dam[3].toLowerCase(),
      sha256: dam[4].toLowerCase(),
    } : null,
  };
}
function stageKey(v: ProcessChunkPayload, index: number): string {
  return "municipalities/" + v.municipalityId +
    "/private-process-staging/" + v.actorId + "/" + v.uploadId + "/" +
    String(index).padStart(4, "0");
}
function statusOf(error: unknown): number {
  return (error as { $metadata?: { httpStatusCode?: number } } | null)
    ?.$metadata?.httpStatusCode || 0;
}
function validSignature(bytes: Buffer, mime: string): boolean {
  if (mime === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/jpeg") return bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/webp") return bytes.subarray(0,4).toString("ascii") === "RIFF" &&
    bytes.subarray(8,12).toString("ascii") === "WEBP";
  return false;
}
export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return respond(res, 405, { error: "Método não permitido." });
  if (!sameOrigin(req)) return respond(res, 403, { error: "Origem não autorizada." });
  if (!readBearer(req)) return respond(res, 401, { error: "Sessão necessária para enviar documentos." });
  let input: ProcessChunkPayload | null;
  try { input = validateProcessChunkPayload(await jsonBody(req)); }
  catch { return respond(res, 400, { error: "Parte do documento inválida ou muito grande." }); }
  if (!input) return respond(res, 400, { error: "Tipo, tamanho ou referência do documento inválida." });
  const v = input;

  // Membership alone never authorizes a write. Original DAMs have a stricter
  // immutable financial-document RPC, not the generic attachment permission.
  if (v.damOriginal) {
    const grant = await callDataApiRpc<boolean>(
      req, "authorize_payment_guide_original_upload_v2", {
        _guide_id: v.damOriginal.guideId,
        _municipality_id: v.municipalityId,
        _process_id: v.damOriginal.processId,
      },
    );
    if (!grant.ok || grant.payload !== true)
      return respond(res,grant.status === 401 ? 401 : 403,{
        error:"A guia não autoriza o envio do PDF original. Uma guia paga não pode ser substituída.",
      });
  } else {
    const grant = await authorizeProcessAttachmentWrite(req, v.objectKey);
    if (grant.ok === false) return respond(res, grant.status, {
      code: grant.code,
      error: "Este perfil não tem autorização para anexar documentos ao processo.",
    });
  }
  const quota = await callDataApiRpc<unknown>(req, "assert_municipality_entitlement_v1", {
    _municipality_id: v.municipalityId, _capability: "storage_bytes", _increment: v.fileSize,
  });
  if (!quota.ok)
    return respond(res, 409, { error: "Plano ou franquia de armazenamento não autorizou este arquivo." });
  const documentBucket = env("R2_BUCKET_DOCUMENTOS") || "sigapro-documentos";
  let ownClient: S3Client | null = null;
  try {
    const target = await resolveMunicipalDocumentTarget(req,v.municipalityId,documentBucket,v.objectKey);
    const staged = await resolveMunicipalDocumentTarget(req,v.municipalityId,documentBucket,stageKey(v,0));
    if (Boolean(target) !== Boolean(staged) ||
        (target && staged && target.bucket !== staged.bucket))
      return respond(res,503,{error:"Configuração municipal de armazenamento inconsistente."});
    const endpoint = resolveR2Endpoint();
    if (!target && (!endpoint || !env("R2_ACCESS_KEY_ID") || !env("R2_SECRET_ACCESS_KEY")))
      return respond(res,503,{error:"Armazenamento municipal indisponível."});
    ownClient = target ? null : new S3Client({region:"auto",endpoint,credentials:{
      accessKeyId:env("R2_ACCESS_KEY_ID"),secretAccessKey:env("R2_SECRET_ACCESS_KEY"),
    }});
    const client = target?.client || ownClient!;
    const bucket = target?.bucket || documentBucket;
    const official = target?.objectKey || v.objectKey;
    const stagePrefix = staged
      ? staged.objectKey.slice(0, -stageKey(v,0).length) : "";
    const partKey = (i:number) => stagePrefix + stageKey(v,i);

    if (v.action === "abort") {
      await client.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{
        Objects:Array.from({length:v.count},(_,i)=>({Key:partKey(i)})), Quiet:true,
      }})).catch(() => undefined);
      return respond(res,200,{ok:true,action:"abort"});
    }
    if (v.action === "chunk") {
      const bytes = Buffer.from(v.base64!,"base64");
      const expected = v.index === v.count-1
        ? v.fileSize-(v.count-1)*PROCESS_CHUNK_BYTES : PROCESS_CHUNK_BYTES;
      if (bytes.length !== expected ||
          createHash("sha256").update(bytes).digest("hex") !== v.chunkSha256 ||
          (v.index === 0 && !validSignature(bytes,v.contentType)))
        return respond(res,400,{error:"A parte recebida não corresponde ao documento original."});
      try {
        await client.send(new PutObjectCommand({
          Bucket:bucket,Key:partKey(v.index!),Body:bytes,
          ContentType:"application/octet-stream",Metadata:{sha256:v.chunkSha256!},
          IfNoneMatch:"*",
        }));
      } catch(error) {
        if (statusOf(error) !== 412) throw error;
        const old = await client.send(new HeadObjectCommand({Bucket:bucket,Key:partKey(v.index!)}));
        if (old.ContentLength !== bytes.length || old.Metadata?.sha256 !== v.chunkSha256)
          return respond(res,409,{error:"Parte já recebida com conteúdo diferente."});
      }
      return respond(res,200,{ok:true,action:"chunk",index:v.index});
    }

    try {
      const exists = await client.send(new HeadObjectCommand({Bucket:bucket,Key:official}));
      if (exists.ContentLength === v.fileSize && exists.ContentType === v.contentType &&
          exists.Metadata?.sha256 === v.fileSha256) {
        if (v.damOriginal) {
          // A matching S3 HEAD is insufficient for a bank-original retry.
          await assertStoredDamOriginal(client,{
            bucket,objectKey:official,logicalObjectKey:v.objectKey,
            expectedSha256:v.damOriginal.sha256,expectedBytes:v.fileSize,
          });
        }
        return respond(res,200,{ok:true,objectKey:v.objectKey,publicUrl:"",resumed:true});
      }
      return respond(res,409,{error:"A revisão já existe e não pode ser sobrescrita."});
    } catch(error) { if (statusOf(error) !== 404) throw error; }

    const created = await client.send(new CreateMultipartUploadCommand({
      Bucket:bucket,Key:official,ContentType:v.contentType,Metadata:{sha256:v.fileSha256!},
    }));
    if (!created.UploadId) throw Error("MULTIPART_ID_MISSING");
    let completed = false;
    const fullHash = createHash("sha256");
    const uploaded: Array<{PartNumber:number;ETag:string}> = [];
    let buffers:Buffer[] = [], buffered = 0, total = 0;
    try {
      for (let i=0;i<v.count;i++) {
        const part = await client.send(new GetObjectCommand({Bucket:bucket,Key:partKey(i)}));
        if (!part.Body) throw Error("MISSING_UPLOAD_CHUNK");
        const bytes = Buffer.from(await part.Body.transformToByteArray());
        const expected = i===v.count-1
          ? v.fileSize-(v.count-1)*PROCESS_CHUNK_BYTES : PROCESS_CHUNK_BYTES;
        if (bytes.length !== expected ||
            part.Metadata?.sha256 !== createHash("sha256").update(bytes).digest("hex") ||
            (i===0 && !validSignature(bytes,v.contentType))) throw Error("CORRUPTED_UPLOAD_CHUNK");
        fullHash.update(bytes);
        total += bytes.length;
        buffers.push(bytes);
        buffered += bytes.length;
        if (buffered >= MIN_S3_PART || i===v.count-1) {
          const index = uploaded.length+1;
          const stored = await client.send(new UploadPartCommand({
            Bucket:bucket,Key:official,UploadId:created.UploadId,
            PartNumber:index,Body:Buffer.concat(buffers,buffered),
          }));
          if (!stored.ETag) throw Error("UPLOAD_PART_ETAG_MISSING");
          uploaded.push({PartNumber:index,ETag:stored.ETag});
          buffers=[];buffered=0;
        }
      }
      if (total !== v.fileSize || fullHash.digest("hex") !== v.fileSha256)
        throw Error("INVALID_DOCUMENT_SHA256");
      await client.send(new CompleteMultipartUploadCommand({
        Bucket:bucket,Key:official,UploadId:created.UploadId,
        MultipartUpload:{Parts:uploaded},
        IfNoneMatch:"*",
      }));
      completed = true;
    } finally {
      if (!completed) {
        await client.send(new AbortMultipartUploadCommand({
          Bucket:bucket,Key:official,UploadId:created.UploadId,
        })).catch(()=>undefined);
      }
    }
    const verified = await client.send(new HeadObjectCommand({Bucket:bucket,Key:official}));
    if (verified.ContentLength !== v.fileSize || verified.ContentType !== v.contentType ||
        verified.Metadata?.sha256 !== v.fileSha256)
      return respond(res,502,{error:"O armazenamento não confirmou a integridade do documento."});
    if (v.damOriginal) {
      // Payable originals are accepted only when the R2/BYOS actual bytes
      // match the canonical key. Never present a merely signed PDF URL.
      await assertStoredDamOriginal(client,{
        bucket,objectKey:official,logicalObjectKey:v.objectKey,
        expectedSha256:v.damOriginal.sha256,expectedBytes:v.fileSize,
      });
    }
    await client.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{
      Objects:Array.from({length:v.count},(_,i)=>({Key:partKey(i)})),Quiet:true,
    }})).catch(()=>undefined);
    return respond(res,200,{ok:true,objectKey:v.objectKey,publicUrl:""});
  } catch(error) {
    const status=statusOf(error);
    return respond(res,status===404||status===412?409:503,{
      error:status===404
        ? "O envio está incompleto. Reenvie as partes sem substituir documentos salvos."
        : "Não foi possível concluir o envio seguro. Nenhum documento oficial foi confirmado.",
    });
  } finally {
    ownClient?.destroy();
  }
}
