import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractUrbanPdfText } from "@/lib/urbanPdfTextReader";

const engine = vi.hoisted(() => {
  const getPage = vi.fn();
  const destroy = vi.fn().mockResolvedValue(undefined);
  const getDocument = vi.fn(() => ({
    promise: Promise.resolve({ numPages: 2, getPage }),
    destroy,
  }));
  return { getPage, getDocument, destroy };
});

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: engine.getDocument,
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/assets/pdf.worker.min.mjs",
}));

beforeEach(() => {
  engine.getPage.mockReset();
  engine.getDocument.mockClear();
  engine.destroy.mockClear();
  engine.getPage.mockImplementation(async (page: number) => ({
    getTextContent: async () => ({
      items: page === 1
        ? [{ str: "Recuo frontal de 5 metros", hasEOL: true },
           { str: "Taxa de ocupação 60%", hasEOL: false }]
        : [],
    }),
    cleanup: vi.fn(),
  }));
});

describe("SIGAPRO: motor PDF.js de leitura textual limitada", () => {
  it("lê página numerada da camada de texto e marca página escaneada sem inventar resultado", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n%%EOF");
    const result = await extractUrbanPdfText(bytes);
    expect(result.totalPages).toBe(2);
    expect(result.pages.map(x => x.page)).toEqual([1,2]);
    expect(result.pages[0].text).toContain("Recuo frontal");
    expect(result.pages[1].text).toBe("");
    expect(result.scannedPages).toBe(1);
    expect(result.truncated).toBe(false);
    expect(engine.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ isEvalSupported: false, stopAtErrors: true }),
    );
    expect(engine.destroy).toHaveBeenCalledOnce();
  });

  it("respeita interrupção da leitura sem retornar medições fictícias", async () => {
    const controller = new AbortController();
    controller.abort();
    const bytes = new TextEncoder().encode("%PDF-1.7\n%%EOF");
    await expect(extractUrbanPdfText(bytes, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(engine.destroy).toHaveBeenCalledOnce();
  });
});
