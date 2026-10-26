import { createHash } from "node:crypto";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";

const MAX_DAM_ORIGINAL_BYTES = 25 * 1024 * 1024;
const ORIGINAL_KEY = /^municipalities\/[a-f0-9-]{36}\/processes\/[a-f0-9-]{36}\/dam-originals\/[a-f0-9-]{36}\/([a-f0-9]{64})\.pdf$/;

/**
 * S3's If-None-Match:* prevents an overwrite, but HTTP 412 is not
 * proof that the existing bytes are the exact original that the browser
 * rendered. Only treat a retry as successful after a verified GET.
 */
export async function verifyImmutableDamOriginalAlreadyStored(
  client: S3Client,
  bucket: string,
  objectKey: string,
): Promise<void> {
  const match = ORIGINAL_KEY.exec(objectKey);
  if (!match || !bucket) {
    throw new Error("Referência permanente DAM inválida.");
  }
  const existing = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  }));
  if (
    existing.ContentLength != null &&
    (existing.ContentLength < 5 || existing.ContentLength > MAX_DAM_ORIGINAL_BYTES)
  ) {
    throw new Error("Original DAM existente excede o limite ou é inválido.");
  }
  if (!existing.Body) {
    throw new Error("Original DAM existente sem conteúdo.");
  }
  const bytes = await existing.Body.transformToByteArray();
  if (
    bytes.byteLength < 5 ||
    bytes.byteLength > MAX_DAM_ORIGINAL_BYTES ||
    Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-" ||
    createHash("sha256").update(bytes).digest("hex") !== match[1]
  ) {
    throw new Error("CONFLITO DE INTEGRIDADE: o original existente não corresponde ao SHA-256 do boleto. Nenhum arquivo foi sobrescrito.");
  }
}
