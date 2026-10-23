import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {UrbanScannedPageDesk} from "@/components/platform/UrbanScannedPageDesk";

vi.mock("@/lib/urbanGraphicPdfRenderer",()=>({
  renderUrbanGraphicPdfPage:vi.fn(async({canvas}:{canvas:HTMLCanvasElement})=>{
    canvas.width=600;
    canvas.height=800;
    return {width:600,height:800,totalPages:2};
  }),
}));

beforeEach(()=>vi.stubGlobal("TextDetector",undefined));
afterEach(()=>vi.unstubAllGlobals());

describe("SIGAPRO — isolation between scanned municipal documents",()=>{
  it("discards pending human verification when the PDF changes without remounting",async()=>{
    const original=new TextEncoder().encode("%PDF-1.7\nfirst");
    const replacement=new TextEncoder().encode("%PDF-1.7\nsecond");
    const onVerifiedTranscript=vi.fn();
    const props={scannedPages:[1],readOnly:false,onVerifiedTranscript};
    const view=render(<UrbanScannedPageDesk bytes={original} {...props}/>);
    fireEvent.click(screen.getByRole("button",{name:"Conferir página digitalizada"}));
    await waitFor(()=>expect(screen.getByRole("textbox",{name:"Primeira leitura do trecho"})).toBeEnabled());
    const sentence="Recuo lateral de três metros";
    fireEvent.change(screen.getByRole("textbox",{name:"Primeira leitura do trecho"}),{
      target:{value:sentence},
    });
    fireEvent.change(screen.getByRole("textbox",{name:"Segunda leitura independente"}),{
      target:{value:sentence},
    });
    fireEvent.click(screen.getByRole("checkbox",{name:"Confirmei texto na imagem original"}));
    expect(screen.getByRole("button",{name:/Usar trecho conferido/})).toBeEnabled();

    view.rerender(<UrbanScannedPageDesk bytes={replacement} {...props}/>);
    expect(screen.getByRole("button",{name:"Conferir página digitalizada"})).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:/Usar trecho conferido/})).not.toBeInTheDocument();
    expect(onVerifiedTranscript).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button",{name:"Conferir página digitalizada"}));
    expect(screen.getByRole("textbox",{name:"Primeira leitura do trecho"})).toHaveValue("");
    expect(screen.getByRole("textbox",{name:"Segunda leitura independente"})).toHaveValue("");
    expect(screen.getByRole("checkbox",{name:"Confirmei texto na imagem original"})).not.toBeChecked();
    expect(screen.getByRole("button",{name:/Usar trecho conferido/})).toBeDisabled();
  });
});
