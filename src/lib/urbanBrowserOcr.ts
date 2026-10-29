/**
 * Progressive browser-native OCR for an ALREADY authenticated PDF canvas.
 * Shape Detection TextDetector is experimental and frequently unavailable.
 * No document upload, external OCR endpoint, CDN or package/model download.
 * Never treated as confirmed evidence until the reviewer verifies the image.
 */
type DetectedText = {
  rawValue?: unknown;
  boundingBox?: { x?: number; y?: number };
};
type DetectorInstance = { detect(image: HTMLCanvasElement): Promise<DetectedText[]> };
type DetectorApi = {
  create?: (options?: { languages?: string[] }) => Promise<DetectorInstance>;
  availability?: (options: { languages: string[] }) => Promise<string>;
  new (): DetectorInstance;
};

function browserApi(): DetectorApi | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const value = (window as Window & { TextDetector?: DetectorApi }).TextDetector;
  return typeof value === "function" ? value : null;
}

export function browserOcrIsOffered(): boolean {
  return browserApi() !== null;
}

export function normalizeBrowserOcrBlocks(blocks: readonly DetectedText[]): string {
  if (!Array.isArray(blocks)) return "";
  const clean = blocks.slice(0,120).filter((part) =>
    typeof part?.rawValue === "string" && part.rawValue.trim().length > 0)
    .map((part,i) => ({
      order:i,
      x: typeof part.boundingBox?.x === "number" ? part.boundingBox.x : 0,
      y: typeof part.boundingBox?.y === "number" ? part.boundingBox.y : i,
      text: String(part.rawValue).replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g," ").trim().slice(0,280),
    }));
  // Keep reading order stable even when bounding boxes are absent.
  clean.sort((a,b)=>Math.abs(a.y-b.y)>8?a.y-b.y:a.x-b.x||a.order-b.order);
  return clean.map(part=>part.text).join("\n").slice(0,4000);
}

export async function suggestUrbanBrowserOcr(canvas: HTMLCanvasElement): Promise<string> {
  const api = browserApi();
  if (!api) throw new Error("OCR nativo indisponível neste navegador. Use a dupla transcrição visual.");
  if (!canvas.width || !canvas.height || canvas.width*canvas.height>10_000_000) {
    throw new Error("A página precisa estar renderizada dentro do limite seguro de pixels.");
  }
  try {
    if (typeof api.create === "function" && typeof api.availability !== "function") {
      throw new Error("Este navegador não permite verificar antecipadamente a disponibilidade do OCR; use a transcrição visual.");
    }
    if (typeof api.availability === "function") {
      // Do NOT start a model download for confidential municipal documents.
      const availability = await api.availability({languages:["pt"]});
      if (availability !== "available") {
        throw new Error("O motor OCR em português não está instalado neste navegador. Use a transcrição manual.");
      }
    }
    const detector = typeof api.create === "function"
      ? await api.create({languages:["pt"]})
      : new api();
    if (!detector || typeof detector.detect !== "function") {
      throw new Error("O navegador não oferece um detector de texto funcional.");
    }
    const result = await detector.detect(canvas);
    return normalizeBrowserOcrBlocks(result);
  } catch (error) {
    if (error instanceof Error && /OCR|detector|navegador|motor/.test(error.message)) throw error;
    throw new Error("Não foi possível reconhecer texto nesta imagem. Use a dupla transcrição visual.");
  }
}
