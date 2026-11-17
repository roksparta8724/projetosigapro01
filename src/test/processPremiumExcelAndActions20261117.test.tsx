// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { buildPremiumProcessWorkbook } from "@/lib/processPremiumExcelExport";
import { PremiumProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import { ProcessBatchActionDialog } from "@/components/platform/ProcessBatchActionDialog";
import type { ProcessRecord } from "@/lib/platform";

const process = {
  id: "f0d131ef-04cd-4278-bd08-8a1626b950ca",
  tenantId: "scope", municipalityId: "scope", isOfficial: true,
  protocol: "PM-2026-00001", externalProtocol: "",
  title: "Licenciamento de Água & Terreno", status: "analise_tecnica",
  ownerName: "José \"Álvaro\" & Filhos", technicalLead: "Ana da Silva", tags: ["🔎 Revisão::blue"],
  type: "aprovacao", payment: { status: "pendente", guideNumber: "", guides: [] },
  requirements: [], dispatches: [], documents: [],
  sla: { breached: false, dueDate: "20/11/2026", hoursRemaining: 36, currentStage: "Análise" },
} as unknown as ProcessRecord;

function zipEntries(file: Uint8Array) {
  const text = new TextDecoder();
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const contents: Record<string, string> = {};
  let cursor = 0;
  while (cursor + 30 <= file.byteLength && view.getUint32(cursor, true) === 0x04034b50) {
    const size = view.getUint32(cursor + 18, true);
    const len = view.getUint16(cursor + 26, true);
    const extra = view.getUint16(cursor + 28, true);
    const name = text.decode(file.subarray(cursor + 30, cursor + 30 + len));
    const start = cursor + 30 + len + extra;
    contents[name] = text.decode(file.subarray(start, start + size));
    cursor = start + size;
  }
  return { contents, offset: cursor, ending: view.getUint32(file.byteLength - 22, true) };
}

describe("SIGAPRO — planilha Excel premium sem dados quebrados", () => {
  it("gera OOXML XLSX válido, nunca CSV separado por delimitadores", () => {
    const bytes = buildPremiumProcessWorkbook([process], "Prefeitura de Teste",
      new Date("2026-11-17T14:00:00.000Z"));
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const zip = zipEntries(bytes);
    expect(zip.ending).toBe(0x06054b50);
    expect(zip.contents["[Content_Types].xml"]).toContain("spreadsheetml.sheet.main+xml");
    expect(zip.contents["xl/workbook.xml"]).toContain('name="Controle de Processos"');
    expect(zip.contents["xl/styles.xml"]).toContain('rgb="FF073D65"');
  });

  it("preserva caracteres, evita fórmulas, congela o cabeçalho, define larguras e filtros", () => {
    const risk = { ...process, id: "new", title: "=SUM(1+1)", ownerName: "A&B <C> 'D' ô", tags: [] };
    const bytes = buildPremiumProcessWorkbook([process, risk], "SIGAPRO QA");
    const sheet = zipEntries(bytes).contents["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("José &quot;Álvaro&quot; &amp; Filhos");
    expect(sheet).toContain("A&amp;B &lt;C&gt; &apos;D&apos; ô");
    expect(sheet).toContain("=SUM(1+1)");
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('autoFilter ref="A6:K8"');
    // Older Excel rejects out-of-order worksheet elements and silently
    // discards data during repair, despite a valid ZIP container.
    expect(sheet.indexOf("<autoFilter ")).toBeLessThan(sheet.indexOf("<mergeCells "));
    const parsed = new DOMParser().parseFromString(sheet, "application/xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(parsed.getElementsByTagName("row")).toHaveLength(6);
    expect(sheet).toContain('dimension ref="A1:K8"');
    expect(sheet).toContain('ySplit="6"');
    expect(sheet).toContain('col min="2" max="2" width="43"');
    expect(sheet).toContain('r="A7" s="4"');
    expect(sheet).toContain('r="A8" s="5"');
  });
});

describe("SIGAPRO — ações após seleção operam a partir da própria mesa", () => {
  it("ativa os cinco comandos e entrega os processos selecionados ao controlador", () => {
    const onAction = vi.fn();
    const { container } = render(<MemoryRouter>
      <PremiumProcessRegistry
        processes={[process]} canDispatchProcess={() => true}
        onToolbarAction={onAction} />
    </MemoryRouter>);
    const checkbox = container.querySelector<HTMLInputElement>(
      '[data-sei-process-row="true"] input[type="checkbox"]'
    );
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox!);
    for (const label of ["Prioridade", "Atribuir", "Encaminhar", "Decisão", "Etiquetas"]) {
      const button = screen.getByRole("button", { name: new RegExp(label) });
      expect(button).toBeEnabled();
      fireEvent.click(button);
    }
    expect(onAction.mock.calls.map(call => call[0])).toEqual([
      "prioridade", "atribuir", "encaminhar", "decisao", "etiquetas",
    ]);
    expect(onAction.mock.calls[4][1]).toHaveLength(1);
    expect(onAction.mock.calls[4][1][0].id).toBe(process.id);
    expect(screen.getByRole("button", { name: /Excel/i })).toBeEnabled();
  });

  it("confirma prioridade com formulário e deixa a assinatura para a ficha oficial", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { rerender } = render(<MemoryRouter>
      <ProcessBatchActionDialog action="prioridade" selected={[process]} canOperate
        analysts={[]} departments={[]} markers={[]} onCreateMarker={vi.fn()}
        onClose={onClose} onSubmit={onSubmit}/>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar operação" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "alta" }),
    ));
    rerender(<MemoryRouter>
      <ProcessBatchActionDialog action="decisao" selected={[process]} canOperate
        analysts={[]} departments={[]} markers={[]} onCreateMarker={vi.fn()}
        onClose={onClose} onSubmit={onSubmit}/>
    </MemoryRouter>);
    expect(screen.getByText(/A decisão exige conferência individual/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir ficha/ })).toHaveAttribute("href",
      expect.stringMatching(/aba=analise/));
  });
});
