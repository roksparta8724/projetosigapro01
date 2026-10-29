/**
 * Read text-layer content from a process PDF in the user's browser only.
 * No external AI, OCR, persistence or automatic approval.
 * The caller MUST first obtain the object URL using SIGAPRO's protected
 * getSignedUrlForObjectStrict and enforce the current process permissions.
 */
export const URBAN_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const URBAN_PDF_MAX_PAGES = 24;
export const URBAN_PDF_MAX_CHARS_PER_PAGE = 3000;

export type UrbanPdfPageText = { page: number; text: string };
export type UrbanPdfTextResult = {
  pages: UrbanPdfPageText[];
  totalPages: number;
  scannedPages: number;
  truncated: boolean;
};

export function ensureUrbanPdfBytes(bytes: Uint8Array): void {
  if (bytes.byteLength < 5 || bytes.byteLength > URBAN_PDF_MAX_BYTES) {
    throw new Error("PDF vazio ou acima do limite de 20 MB para pré-leitura.");
  }
  const magic = new TextDecoder("ascii").decode(bytes.subarray(0, 5));
  if (magic !== "%PDF-") throw new Error("O arquivo retornado não é um PDF válido.");
}

function allowedSignedPdfUrl(url: string): boolean {
  try {
    const resolved = new URL(url, typeof window === "undefined" ? "https://sigapro.invalid" : window.location.href);
    return resolved.protocol === "https:" ||
      (resolved.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(resolved.hostname));
  } catch {
    return false;
  }
}

export async function downloadUrbanPdfBytes(
  signedUrl: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!signedUrl || !allowedSignedPdfUrl(signedUrl)) {
    throw new Error("Link seguro do PDF indisponível ou inválido.");
  }
  const response = await fetch(signedUrl, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error("Não foi possível abrir o PDF com sua autorização atual.");
  }
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > URBAN_PDF_MAX_BYTES) {
    throw new Error("O PDF ultrapassa 20 MB; utilize leitura manual.");
  }

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    ensureUrbanPdfBytes(buffer);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Leitura cancelada.", "AbortError");
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > URBAN_PDF_MAX_BYTES) {
        throw new Error("O PDF ultrapassa 20 MB; utilize leitura manual.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    combined.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  ensureUrbanPdfBytes(combined);
  return combined;
}

export async function extractUrbanPdfText(
  bytes: Uint8Array,
  options?: {
    signal?: AbortSignal;
    onProgress?: (page: number, total: number) => void;
  },
): Promise<UrbanPdfTextResult> {
  ensureUrbanPdfBytes(bytes);
  // Lazy-load ~1MB PDF engine only when the analyst requests a pre-read.
  // Its worker is a local Vite asset: neither PDF content nor auth tokens
  // are sent to a CDN, third-party AI model or OCR endpoint.
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdfTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    stopAtErrors: true,
  });
  try {
    const pdf = await pdfTask.promise;
    const totalPages = pdf.numPages;
    const limit = Math.min(totalPages, URBAN_PDF_MAX_PAGES);
    const pages: UrbanPdfPageText[] = [];
    let scannedPages = 0;
    for (let pageIndex = 1; pageIndex <= limit; pageIndex++) {
      if (options?.signal?.aborted) throw new DOMException("Leitura cancelada.", "AbortError");
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item && typeof item.str === "string"
          ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
        .slice(0, URBAN_PDF_MAX_CHARS_PER_PAGE);
      if (!text) scannedPages++;
      pages.push({ page: pageIndex, text });
      options?.onProgress?.(pageIndex, totalPages);
      page.cleanup();
    }
    return {
      pages,
      totalPages,
      scannedPages,
      truncated: totalPages > limit,
    };
  } finally {
    await pdfTask.destroy();
  }
}
