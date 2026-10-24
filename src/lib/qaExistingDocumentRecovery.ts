import { validateQaLocalPdf } from "@/lib/qaLocalPdfPreview";

export type QaExistingDocumentMetadata = {
  fileHash?: string;
  fileSizeBytes?: number;
};

/**
 * Validate user-selected bytes against immutable process metadata BEFORE
 * storing a QA-only copy. No fallback when the registry has no SHA-256.
 */
export async function verifyQaExistingDocumentCopy(
  file: File,
  metadata: QaExistingDocumentMetadata,
): Promise<void> {
  await validateQaLocalPdf(file);
  const expectedSize = Number(metadata.fileSizeBytes);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 ||
      file.size !== expectedSize) {
    throw new Error("O tamanho desta cópia não corresponde ao documento cadastrado. Nada foi importado.");
  }
  const expectedHash = String(metadata.fileHash || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error("O cadastro não possui SHA-256 verificável. A importação persistente foi bloqueada.");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("Este navegador não permite verificar a integridade SHA-256.");
  }
  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  const actual = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  if (actual !== expectedHash) {
    throw new Error("SHA-256 diferente do arquivo cadastrado. Nada foi importado.");
  }
}
