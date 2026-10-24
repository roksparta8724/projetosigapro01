/**
 * Vercel's current QA JSON/base64 upload path has a 2 MiB decoded-file limit.
 * Validate BEFORE FileReader serializes to base64; do not alter production.
 */
export const QA_MAX_JSON_UPLOAD_BYTES = 2 * 1024 * 1024;
export function qaUploadMime(file: Pick<File, "name" | "type">): string {
  const detected = String(file.type || "").trim().toLowerCase();
  // Windows browsers sometimes omit MIME for a user-selected .pdf.
  // The QA server also checks for the %PDF- magic bytes before persisting.
  if (!detected && /\.pdf$/i.test(String(file.name || ""))) return "application/pdf";
  return detected || "application/octet-stream";
}
export function validateQaUploadPreflight(file: Pick<File, "size" | "name" | "type">) {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error("O arquivo está vazio ou possui tamanho inválido. Nada foi enviado.");
  }
  if (file.size > QA_MAX_JSON_UPLOAD_BYTES) {
    throw new Error("A homologação aceita anexos de até 2 MB por envio. O arquivo não foi transmitido. PDFs maiores dependem do upload direto para o bucket exclusivo de QA.");
  }
  const mime = qaUploadMime(file);
  if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw new Error("Na homologação, envie documentos PDF ou imagens PNG, JPG e WebP.");
  }
}
