/**
 * Two-entry check for MANUAL transcriptions of scanned PDF page images.
 * Not OCR: the analyst remains responsible for faithfully reading the source.
 */
export function normalizeUrbanScanTranscript(value: string): string {
  return String(value ?? "").normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim();
}
export function validateUrbanScanTranscription(
  first: string, second: string, page: number, allowedPages: readonly number[],
): string | null {
  if (!Number.isInteger(page) || !allowedPages.includes(page))
    return "Selecione uma página escaneada disponível no PDF autorizado.";
  const left=normalizeUrbanScanTranscript(first);
  const right=normalizeUrbanScanTranscript(second);
  if (left.length < 15 || left.length > 280)
    return "Transcreva um trecho de 15 a 280 caracteres da página escaneada.";
  if (left !== right)
    return "As duas transcrições não coincidem. Confira o texto na imagem original.";
  return null;
}
