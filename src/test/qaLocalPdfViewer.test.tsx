import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QaDocumentUnavailableNotice } from "@/components/platform/QaDocumentUnavailableNotice";

vi.mock("@/lib/qaLocalPdfPreview", () => ({
  validateQaLocalPdf: vi.fn(async () => {}),
}));

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true, writable: true,
    value: vi.fn(() => "blob:http://localhost:8080/test-local-pdf"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true, writable: true, value: vi.fn(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("SIGAPRO QA — alternativa temporária ao documento oficial", () => {
  it("permite abrir PDF escolhido pelo usuário no iframe local, sem enviar ou substituir arquivo", async () => {
    const view = render(
      <QaDocumentUnavailableNotice
        processRoute="/processos/PM-2026-00003"
        documentId="f5d5e9aa-9ef9-4074-ab22-78bc0081e964"
      />,
    );
    expect(screen.getByRole("button", { name: /abrir pdf do computador aqui/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir documento no sigapro oficial/i })).toHaveAttribute(
      "href",
      "https://sigapromunicipal.com.br/processos/PM-2026-00003/documentos/f5d5e9aa-9ef9-4074-ab22-78bc0081e964/visualizar",
    );

    const input = screen.getByLabelText("Selecionar PDF do computador para consulta local");
    fireEvent.change(input, {
      target: { files: [new File(["%PDF-1.7"], "prancha-qa.pdf", { type: "application/pdf" })] },
    });
    const iframe = await screen.findByTitle("Pré-visualização local de prancha-qa.pdf");
    expect(iframe).toHaveAttribute("src", expect.stringContaining("blob:http://localhost:8080/"));
    expect(screen.getByText(/não substitui o anexo do processo/i)).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /fechar consulta/i }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost:8080/test-local-pdf",
    ));
    expect(screen.getByRole("button", { name: /abrir pdf do computador aqui/i })).toBeInTheDocument();
    view.unmount();
  });
});
