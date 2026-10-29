import { describe,expect,it,vi } from "vitest";
import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { UrbanScannedPageDesk } from "@/components/platform/UrbanScannedPageDesk";
import { normalizeUrbanScanTranscript,validateUrbanScanTranscription } from "@/lib/urbanScannedTranscription";

vi.mock("@/lib/urbanGraphicPdfRenderer",()=>({
  renderUrbanGraphicPdfPage: vi.fn(async({canvas}:{canvas:HTMLCanvasElement})=>{
    canvas.width=1000;canvas.height=650;
    return {width:1000,height:650,totalPages:4};
  }),
}));

const source="Artigo 25. O recuo frontal é de cinco metros.";
const bytes=new TextEncoder().encode("%PDF-1.7\n%%EOF");

describe("SIGAPRO QA — conferência visual de página escaneada",()=>{
  it("valida duas leituras independentes sem interpretar ou inventar texto",()=>{
    expect(validateUrbanScanTranscription(source,source,2,[2,3])).toBeNull();
    expect(normalizeUrbanScanTranscript("  Artigo 25.\n Recuo \t frontal  ")).toBe("Artigo 25. Recuo frontal");
    expect(validateUrbanScanTranscription(source,"Artigo 25. O recuo frontal é de seis metros.",2,[2])).toMatch(/não coincidem/i);
    expect(validateUrbanScanTranscription("curto","curto",2,[2])).toMatch(/15 a 280/);
    expect(validateUrbanScanTranscription(source,source,1,[2])).toMatch(/página/i);
    expect(validateUrbanScanTranscription(source,source,25,[25])).toBeNull(); // pure verifier checks membership; UI restricts PDF 24-page cap.
  });

  it("só encaminha trecho da página permitida após dupla digitação e confirmação",async()=>{
    const onVerifiedTranscript=vi.fn();
    render(<UrbanScannedPageDesk bytes={bytes} scannedPages={[2,3]}
      readOnly={false} onVerifiedTranscript={onVerifiedTranscript}/>);
    expect(screen.getByText(/2 página\(s\) sem texto/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/Conferir página digitalizada/i}));
    const confirm=screen.getByRole("button",{name:/Usar trecho conferido da página 2/i});
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox",{name:/Primeira leitura/i}),{target:{value:source}});
    fireEvent.change(screen.getByRole("textbox",{name:/Segunda leitura/i}),{
      target:{value:"Artigo 25. O recuo frontal é de seis metros."},
    });
    expect(screen.getByRole("checkbox",{name:/Confirmei texto/i})).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox",{name:/Segunda leitura/i}),{target:{value:source}});
    const check=screen.getByRole("checkbox",{name:/Confirmei texto/i});
    await waitFor(()=>expect(check).toBeEnabled());
    fireEvent.click(check);
    fireEvent.click(confirm);
    expect(onVerifiedTranscript).toHaveBeenCalledOnce();
    expect(onVerifiedTranscript).toHaveBeenCalledWith({page:2,text:source,method:"visual_double_transcription"});
    expect(screen.getByRole("checkbox",{name:/Confirmei texto/i})).not.toBeChecked();
  });

  it("não oferece edição para perfis sem permissão",()=>{
    const fn=vi.fn();
    const {container}=render(<UrbanScannedPageDesk bytes={bytes}
      scannedPages={[1]} readOnly={true} onVerifiedTranscript={fn}/>);
    expect(container).toBeEmptyDOMElement();
    expect(fn).not.toHaveBeenCalled();
  });

  it("integra conferência local à origem da análise e à legislação",()=>{
    const documents=readFileSync(resolve(process.cwd(),
      "src/components/platform/UrbanDocumentEvidenceDesk.tsx"),"utf8");
    const laws=readFileSync(resolve(process.cwd(),
      "src/components/platform/UrbanLegalKnowledgeDesk.tsx"),"utf8");
    const ui=readFileSync(resolve(process.cwd(),
      "src/components/platform/UrbanScannedPageDesk.tsx"),"utf8");
    expect(documents).toContain("Transcrição visual dupla, sem OCR");
    expect(documents).toContain("setScanProof({page,text,documentId:selected.id,method})");
    expect(laws).toContain("scannedProof.hash === fileHash");
    expect(laws).toContain("scannedProof.text === normalizeUrbanScanTranscript(manualExcerpt)");
    expect(laws).toContain("pdfPages.some(entry => entry.page === page && !entry.text.trim())");
    expect(laws).toContain("setScannedProof(null)");
    expect(laws).toContain('verificationMethod: scanDoubleVerified ? scannedProof.method');
    expect(readFileSync(resolve(process.cwd(),"neon/migrations/20261024_urban_scanned_source_audit_v5.sql"),"utf8"))
      .toContain("revoke execute on function public.save_urban_legal_evidence_scoped_v2");
    expect(ui).toContain("renderUrbanGraphicPdfPage(");
    expect(ui).not.toContain("fetch(");
    expect(ui).not.toContain("uploadFile(");
  });
});
