/**
 * Optional QA visual inspection of a PDF deliberately selected by the user.
 * Never uploads or persists bytes and never treats the file as a verified
 * replacement for a municipality process document.
 */
export const QA_LOCAL_PDF_MAX_BYTES = 20 * 1024 * 1024;

export type QaLocalPdfLike = Pick<File, "name" | "size" | "slice">;

export async function validateQaLocalPdf(file: QaLocalPdfLike): Promise<void> {
  if (!/\.pdf$/i.test(file.name.trim())) {
    throw new Error("Escolha um arquivo com extensão .pdf.");
  }
  if (!Number.isFinite(file.size) || file.size < 5 || file.size > QA_LOCAL_PDF_MAX_BYTES) {
    throw new Error("O PDF deve ter até 20 MB e não pode estar vazio.");
  }
  const firstBytes = await file.slice(0, 5).arrayBuffer();
  const signature = new TextDecoder("ascii").decode(firstBytes);
  if (signature !== "%PDF-") {
    throw new Error("O arquivo escolhido não possui a assinatura de um PDF válido.");
  }
}
