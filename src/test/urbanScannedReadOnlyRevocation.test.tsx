import {describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen} from "@testing-library/react";
import {renderUrbanGraphicPdfPage} from "@/lib/urbanGraphicPdfRenderer";
import {UrbanScannedPageDesk} from "@/components/platform/UrbanScannedPageDesk";

vi.mock("@/lib/urbanGraphicPdfRenderer",()=>({
  renderUrbanGraphicPdfPage:vi.fn(async({canvas}:{canvas:HTMLCanvasElement})=>{
    canvas.width=600;canvas.height=800;
    return {width:600,height:800,totalPages:1};
  }),
}));

describe("SIGAPRO — scanned evidence permissions",()=>{
  it("revokes pending transcript after analyst becomes read-only",()=>{
    const bytes=new TextEncoder().encode("%PDF-1.7\\n%%EOF");
    const onVerifiedTranscript=vi.fn();
    const view=render(<UrbanScannedPageDesk bytes={bytes} scannedPages={[1]}
      readOnly={false} onVerifiedTranscript={onVerifiedTranscript}/>);
    fireEvent.click(screen.getByRole("button",{name:"Conferir página digitalizada"}));
    const value="Afastamento obrigatório de quatro metros";
    fireEvent.change(screen.getByRole("textbox",{name:"Primeira leitura do trecho"}),{target:{value}});
    fireEvent.change(screen.getByRole("textbox",{name:"Segunda leitura independente"}),{target:{value}});
    const renderCall=vi.mocked(renderUrbanGraphicPdfPage).mock.calls.at(-1);
    const renderSignal=renderCall?.[0]?.signal;
    expect(renderSignal).toBeDefined();
    expect(renderSignal?.aborted).toBe(false);
    view.rerender(<UrbanScannedPageDesk bytes={bytes} scannedPages={[1]}
      readOnly={true} onVerifiedTranscript={onVerifiedTranscript}/>);
    expect(renderSignal?.aborted).toBe(true);
    expect(screen.queryByRole("button",{name:/Usar trecho conferido/})).not.toBeInTheDocument();
    view.rerender(<UrbanScannedPageDesk bytes={bytes} scannedPages={[1]}
      readOnly={false} onVerifiedTranscript={onVerifiedTranscript}/>);
    fireEvent.click(screen.getByRole("button",{name:"Conferir página digitalizada"}));
    expect(screen.getByRole("textbox",{name:"Primeira leitura do trecho"})).toHaveValue("");
    expect(screen.getByRole("textbox",{name:"Segunda leitura independente"})).toHaveValue("");
    expect(screen.getByRole("button",{name:/Usar trecho conferido/})).toBeDisabled();
    expect(onVerifiedTranscript).not.toHaveBeenCalled();
  });
});
