import { ensureUrbanPdfBytes, URBAN_PDF_MAX_PAGES } from "@/lib/urbanPdfTextReader";

/**
 * On-demand, one-page-only browser render of an already authorized PDF.
 * No remote converter, OCR, API call or persistent copy of the drawing.
 */
export async function renderUrbanGraphicPdfPage(input: {
  bytes: Uint8Array;
  pageNumber: number;
  scale: number;
  canvas: HTMLCanvasElement;
  signal?: AbortSignal;
}): Promise<{width:number;height:number;totalPages:number}> {
  const { bytes, pageNumber, canvas, signal } = input;
  ensureUrbanPdfBytes(bytes);
  if (signal?.aborted) throw new DOMException("Leitura cancelada.", "AbortError");
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > URBAN_PDF_MAX_PAGES)
    throw new Error("Página fora do limite de pré-visualização.");
  if (!Number.isFinite(input.scale) || input.scale < 0.5 || input.scale > 2.5)
    throw new Error("Zoom do desenho inválido.");
  const [pdfjs,worker]=await Promise.all([
    import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
  // Copy is important: PDF.js may transfer ownership of its ArrayBuffer to the worker.
  const task=pdfjs.getDocument({
    data: bytes.slice(), isEvalSupported:false, useSystemFonts:false,
    stopAtErrors:true,
  });
  try {
    const pdf=await task.promise;
    if(signal?.aborted) throw new DOMException("Leitura cancelada.", "AbortError");
    if(pageNumber>pdf.numPages) throw new Error("A página não existe no PDF selecionado.");
    const page=await pdf.getPage(pageNumber);
    const base=page.getViewport({scale:1});
    const maxScale=Math.min(
      input.scale,4600/base.width,4600/base.height,
      Math.sqrt(10_000_000/(base.width*base.height)),
    );
    if(!Number.isFinite(maxScale) || maxScale<=0)
      throw new Error("Dimensão do PDF incompatível com a visualização segura.");
    const viewport=page.getViewport({scale:maxScale});
    canvas.width=Math.floor(viewport.width);
    canvas.height=Math.floor(viewport.height);
    const context=canvas.getContext("2d",{alpha:false});
    if(!context) throw new Error("Este navegador não disponibiliza um canvas para a planta.");
    const render=page.render({canvasContext:context,viewport});
    const cancel=()=>render.cancel();
    signal?.addEventListener("abort",cancel,{once:true});
    try{
      await render.promise;
      if(signal?.aborted) throw new DOMException("Leitura cancelada.", "AbortError");
    } finally{
      signal?.removeEventListener("abort",cancel);
    }
    return {width:canvas.width,height:canvas.height,totalPages:pdf.numPages};
  } finally {
    await task.destroy();
  }
}
