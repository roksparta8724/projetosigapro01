import {describe,expect,it,vi} from "vitest";
import {renderUrbanGraphicPdfPage} from "@/lib/urbanGraphicPdfRenderer";

const getPage=vi.fn();
const destroy=vi.fn(async()=>{});
vi.mock("pdfjs-dist",()=>({
  GlobalWorkerOptions:{workerSrc:""},
  getDocument:()=>({promise:Promise.resolve({
    numPages:1,
    getPage,
  }),destroy}),
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url",()=>({default:"local-worker.js"}));

describe("SIGAPRO — cancelamento de leitura gráfica",()=>{
  it("não modifica canvas quando a página terminou de carregar após cancelamento",async()=>{
    const controller=new AbortController();
    getPage.mockImplementationOnce(async()=>{
      controller.abort();
      return {getViewport:vi.fn()};
    });
    const canvas={width:0,height:0,getContext:vi.fn()} as unknown as HTMLCanvasElement;
    await expect(renderUrbanGraphicPdfPage({
      bytes:new TextEncoder().encode("%PDF-1.7\n1 0 obj\n%%EOF"),
      pageNumber:1,scale:1,canvas,signal:controller.signal,
    })).rejects.toMatchObject({name:"AbortError"});
    expect(canvas.getContext).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });
});
