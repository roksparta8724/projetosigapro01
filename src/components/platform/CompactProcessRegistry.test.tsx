import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CompactProcessRegistry } from "@/components/platform/CompactProcessRegistry";
import type { ProcessRecord } from "@/lib/platform";

const records = Array.from({ length: 2000 }, (_, index) => ({
  id: "process-" + index,
  municipalityId: "11111111-1111-4111-8111-111111111111",
  protocol: "2026/" + String(index + 1).padStart(6, "0"),
  title: "Projeto de teste " + String(index + 1),
  type: "aprovacao",
  status: "analise_tecnica",
  ownerName: "Proprietário " + index,
  technicalLead: "Analista municipal",
  tags: [],
  dispatches: [],
  timeline: [],
  analysis: null,
  sla: { currentStage: "Análise técnica", hoursRemaining: 48, breached: false },
})) as unknown as ProcessRecord[];

describe("SIGAPRO QA — 2.000 processos não criam 2.000 linhas no DOM", () => {
  it("mostra apenas 25 processos por vez e pagina mantendo links existentes", () => {
    const { container } = render(
      <MemoryRouter>
        <CompactProcessRegistry processes={records} showArchiveAction={false} />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll("[data-sei-process-row]")).toHaveLength(25);
    expect(screen.getByText(/Página 1 de 80/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paginação de processos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(container.querySelectorAll("[data-sei-process-row]")).toHaveLength(25);
    expect(screen.getByText(/Página 2 de 80/)).toBeInTheDocument();
  });

  it("não cria paginação desnecessária com uma fila pequena", () => {
    const { container } = render(
      <MemoryRouter>
        <CompactProcessRegistry processes={records.slice(0, 5)} />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll("[data-sei-process-row]")).toHaveLength(5);
    expect(screen.queryByRole("navigation", { name: "Paginação de processos" })).not.toBeInTheDocument();
  });
  it("mantém coluna de marcador legível e etiquetas longas dentro da linha", () => {
    const longMarker = "Prioridade especial para conferência documental e análise urbanística complementar";
    const process = { ...records[0], tags: [longMarker + "::orange"] } as ProcessRecord;
    const { container } = render(
      <MemoryRouter>
        <CompactProcessRegistry processes={[process]} showArchiveAction={false} />
      </MemoryRouter>,
    );
    const registry = container.querySelector('[data-sei-process-registry="true"]');
    const header = registry?.querySelector('[title="Marcador"]');
    const row = registry?.querySelector('[data-sei-process-row="true"]');
    expect(header?.querySelector(".sr-only")).toHaveTextContent("Marcador");
    expect(header?.querySelector("svg")).toBeInTheDocument();
    expect(row?.className).toContain("xl:grid-cols-[44px_");
    expect(row?.querySelectorAll('[title="' + longMarker + '"]')).toHaveLength(2);
    expect(row?.querySelector(".flex-wrap")).toBeInTheDocument();
    expect(row?.querySelector(".max-w-full.truncate")).toBeInTheDocument();
  });

});
