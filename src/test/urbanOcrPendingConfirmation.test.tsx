import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UrbanScannedPageDesk } from "@/components/platform/UrbanScannedPageDesk";

vi.mock("@/lib/urbanGraphicPdfRenderer", () => ({
  renderUrbanGraphicPdfPage: vi.fn(async ({canvas}: {canvas: HTMLCanvasElement}) => {
    canvas.width = 600; canvas.height = 800;
    return {width:600,height:800,totalPages:1};
  }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("SIGAPRO - OCR em andamento", () => {
  it("bloqueia confirmar trecho enquanto o reconhecimento não termina", async () => {
    vi.stubGlobal("isSecureContext", true);
    let finish!: (value: Array<{rawValue:string}>) => void;
    const pending = new Promise<Array<{rawValue:string}>>(resolve => { finish = resolve; });
    class TextDetector {
      static availability = vi.fn(async () => "available");
      static create = vi.fn(async () => ({detect: () => pending}));
    }
    vi.stubGlobal("TextDetector", TextDetector);
    const onVerifiedTranscript = vi.fn();
    render(<UrbanScannedPageDesk
      bytes={new TextEncoder().encode("%PDF-1.7\n%%EOF")}
      scannedPages={[1]} readOnly={false}
      onVerifiedTranscript={onVerifiedTranscript}
    />);
    fireEvent.click(screen.getByRole("button", {name:"Conferir página digitalizada"}));
    const first = screen.getByRole("textbox", {name:"Primeira leitura do trecho"});
    const second = screen.getByRole("textbox", {name:"Segunda leitura independente"});
    const phrase = "Recuo frontal de cinco metros";
    fireEvent.change(first, {target:{value:phrase}});
    fireEvent.change(second, {target:{value:phrase}});
    fireEvent.click(screen.getByRole("checkbox", {name:"Confirmei texto na imagem original"}));
    await waitFor(() => expect(screen.getByRole("button", {name:"Sugerir texto por OCR local"})).toBeEnabled());
    fireEvent.click(screen.getByRole("button", {name:"Sugerir texto por OCR local"}));
    expect(screen.getByRole("button", {name:/Usar trecho conferido/})).toBeDisabled();
    expect(onVerifiedTranscript).not.toHaveBeenCalled();
    finish([{rawValue:phrase}]);
    await waitFor(() => expect(screen.getByRole("button", {name:/Usar trecho conferido/})).toBeEnabled());
  });
});
