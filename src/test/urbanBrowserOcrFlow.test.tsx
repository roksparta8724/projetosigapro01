import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {UrbanScannedPageDesk} from "@/components/platform/UrbanScannedPageDesk";

vi.mock("@/lib/urbanGraphicPdfRenderer",()=>({
  renderUrbanGraphicPdfPage:vi.fn(async({canvas}:{canvas:HTMLCanvasElement})=>{
    canvas.width=900;canvas.height=650;
    return {width:900,height:650,totalPages:2};
  }),
}));

const bytes=new TextEncoder().encode("%PDF-1.7\n%%EOF");
const recognized="Recuo frontal: cinco metros e vinte centímetros";

beforeEach(()=>{
  vi.stubGlobal("isSecureContext",true);
});
afterEach(()=>vi.unstubAllGlobals());

describe("SIGAPRO QA — OCR opcional preserva revisão humana e fonte auditada",()=>{
  it("preenche somente a primeira leitura; sem segunda leitura não permite usar trecho",async()=>{
    const detector={detect:vi.fn(async()=>[
      {rawValue:recognized,boundingBox:{x:0,y:0}},
    ])};
    class TextDetector{
      static availability=vi.fn(async()=>"available");
      static create=vi.fn(async()=>detector);
    }
    vi.stubGlobal("TextDetector",TextDetector);
    const record=vi.fn();
    render(<UrbanScannedPageDesk bytes={bytes} scannedPages={[2]}
      readOnly={false} onVerifiedTranscript={record}/>);
    fireEvent.click(screen.getByRole("button",{name:/Conferir página digitalizada/}));
    const suggest=await screen.findByRole("button",{name:"Sugerir texto por OCR local"});
    await waitFor(()=>expect(suggest).toBeEnabled());
    fireEvent.click(suggest);
    expect(await screen.findByRole("textbox",{name:"Sugestão bruta de OCR"})).toHaveValue(recognized);
    fireEvent.click(screen.getByRole("button",{name:/Copiar sugestão somente para a primeira leitura/}));
    expect(screen.getByRole("textbox",{name:"Primeira leitura do trecho"})).toHaveValue(recognized);
    expect(screen.getByRole("textbox",{name:"Segunda leitura independente"})).toHaveValue("");
    expect(screen.getByRole("button",{name:/Usar trecho conferido/})).toBeDisabled();
    expect(record).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox",{name:"Segunda leitura independente"}),{
      target:{value:recognized},
    });
    fireEvent.click(screen.getByRole("checkbox",{name:/Confirmei texto na imagem original/}));
    fireEvent.click(screen.getByRole("button",{name:/Usar trecho conferido/}));
    expect(record).toHaveBeenCalledWith({
      page:2,text:recognized,method:"browser_ocr_human_verified",
    });
    expect(TextDetector.availability).toHaveBeenCalledWith({languages:["pt"]});
  });
  it("mantém transcrição manual utilizável sem suporte OCR",async()=>{
    vi.stubGlobal("TextDetector",undefined);
    const record=vi.fn();
    render(<UrbanScannedPageDesk bytes={bytes} scannedPages={[2]}
      readOnly={false} onVerifiedTranscript={record}/>);
    fireEvent.click(screen.getByRole("button",{name:/Conferir página digitalizada/}));
    expect(screen.getByText(/OCR nativo não disponível neste navegador/)).toBeInTheDocument();
    await waitFor(()=>expect(screen.getByRole("textbox",{name:"Primeira leitura do trecho"})).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox",{name:"Primeira leitura do trecho"}),{
      target:{value:recognized},
    });
    fireEvent.change(screen.getByRole("textbox",{name:"Segunda leitura independente"}),{
      target:{value:recognized},
    });
    fireEvent.click(screen.getByRole("checkbox",{name:/Confirmei texto na imagem original/}));
    fireEvent.click(screen.getByRole("button",{name:/Usar trecho conferido/}));
    expect(record).toHaveBeenCalledWith({
      page:2,text:recognized,method:"visual_double_transcription",
    });
  });
});
