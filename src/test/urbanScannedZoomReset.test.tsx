import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {UrbanScannedPageDesk} from "@/components/platform/UrbanScannedPageDesk";

vi.mock("@/lib/urbanGraphicPdfRenderer",()=>({
  renderUrbanGraphicPdfPage:vi.fn(async({canvas}:{canvas:HTMLCanvasElement})=>{
    canvas.width=600; canvas.height=800;
    return {width:600,height:800,totalPages:2};
  }),
}));

beforeEach(()=>vi.stubGlobal("TextDetector",undefined));
afterEach(()=>vi.unstubAllGlobals());

describe("SIGAPRO — scanned image visual verification after zoom",()=>{
  it("clears unverified readings and confirmation after changing image scale",async()=>{
    const bytes=new TextEncoder().encode("%PDF-1.7\n%%EOF");
    const onVerifiedTranscript=vi.fn();
    render(<UrbanScannedPageDesk bytes={bytes} scannedPages={[1]}
      readOnly={false} onVerifiedTranscript={onVerifiedTranscript}/>);
    fireEvent.click(screen.getByRole("button",{name:"Conferir página digitalizada"}));
    await waitFor(()=>expect(screen.getByRole("textbox",{name:"Primeira leitura do trecho"})).toBeEnabled());
    const text="Recuo frontal de cinco metros";
    fireEvent.change(screen.getByRole("textbox",{name:"Primeira leitura do trecho"}),{target:{value:text}});
    fireEvent.change(screen.getByRole("textbox",{name:"Segunda leitura independente"}),{target:{value:text}});
    fireEvent.click(screen.getByRole("checkbox",{name:"Confirmei texto na imagem original"}));
    expect(screen.getByRole("button",{name:/Usar trecho conferido/})).toBeEnabled();

    fireEvent.change(screen.getByRole("combobox",{name:"Zoom da página escaneada"}),{
      target:{value:"1.8"},
    });

    expect(screen.getByRole("textbox",{name:"Primeira leitura do trecho"})).toHaveValue("");
    expect(screen.getByRole("textbox",{name:"Segunda leitura independente"})).toHaveValue("");
    expect(screen.getByRole("checkbox",{name:"Confirmei texto na imagem original"})).not.toBeChecked();
    expect(screen.getByRole("button",{name:/Usar trecho conferido/})).toBeDisabled();
    expect(onVerifiedTranscript).not.toHaveBeenCalled();
  });
});
