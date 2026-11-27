/**
 * Content integrity for persisted municipal PDF documents.
 * Compare against the canonical Neon file_hash (not ETag or filename).
 * Never accept a missing hash, a size mismatch or changed R2 bytes.
 */
import { createHash } from "node:crypto";

export function verifyPersistedPdfIntegrity(
  bytes: Uint8Array,
  expectedSha256: string | null | undefined,
  expectedSize: string | number | null | undefined,
): string {
  const hash = String(expectedSha256 || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("PDF_HASH_UNAVAILABLE");
  const declaredSize = Number(expectedSize);
  if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0 ||
      bytes.byteLength !== declaredSize) throw new Error("PDF_SIZE_MISMATCH");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== hash) throw new Error("PDF_HASH_MISMATCH");
  return actual;
}
