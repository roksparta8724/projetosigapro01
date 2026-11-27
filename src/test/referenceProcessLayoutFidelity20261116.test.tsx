// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PremiumProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import type { ProcessRecord } from "@/lib/platform";

const records = Array.from({ length: 12 }, (_, index) => ({
  id: "reference-process-" + index,
  municipalityId: "11111111-1111-4111-8111-111111111111",
  protocol: "PM-2026-" + String(index + 1).padStart(5, "0"),
  title: "Licenciamento Urbanístico " + (index + 1),
  type: "aprovacao",
  status: "analise_tecnica",
  ownerName: "Interessado municipal",
  technicalLead: "Analista da Prefeitura",
  tags: index === 0 ? ["Prioridade::orange", "Vistoria::blue"] : [],
  requirements: [],
  payment: { status: "confirmado", guides: [] },
  dispatches: [], timeline: [], analysis: null,
  sla: { currentStage: "Análise Urbanística", dueDate: "26/01/2026",
    hoursRemaining: index === 0 ? 2 : 72, breached: false },
})) as unknown as ProcessRecord[];

const source = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO — fidelidade ao painel gráfico aprovado", () => {
  it("mostra quatro indicadores, filtros, controle de marcadores e tabela paginada", () => {
    const { container } = render(
      <MemoryRouter>
        <PremiumProcessRegistry processes={records} showArchiveAction={false}
          operatorName="Analista da Prefeitura" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Controle de Processos" })).toBeInTheDocument();
    for (const title of ["Processos no município", "Com atenção ao prazo",
      "Guias pendentes", "Aguardando decisão"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(container.querySelectorAll("[data-sei-process-row]")).toHaveLength(10);
    expect(screen.getByText("PM-2026-00001")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paginação de processos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir para página 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ordenar processos por número" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ordenar processos por prazo" })).toBeInTheDocument();
    expect(container.querySelector(".lucide-flame")).toBeInTheDocument();
    expect(container.querySelector(".lucide-map-pin")).toBeInTheDocument();
  });

  it("filtra o SLA real e mantém a coluna Abrir processo funcional", () => {
    const { container } = render(
      <MemoryRouter><PremiumProcessRegistry processes={records} showArchiveAction={false} /></MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "SLA crítico" }));
    expect(container.querySelectorAll("[data-sei-process-row]")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Abrir processo PM-2026-00001/ })).toHaveAttribute("href");
  });

  it("aplica um estilo consolidado à tabela em todas as mesas e não replica dados fictícios", () => {
    const panel = source("src/components/platform/PremiumProcessRegistry.tsx");
    const layout = source("src/styles/sigapro-reference-layout.css");
    expect(panel).toContain('import "@/styles/sigapro-reference-layout.css"');
    for (const token of [
      "sig-workspace-kpis", "sig-workspace-filters", "sig-workspace-actions",
      "sig-process-row", "sig-reference-marker-heading", "sig-reference-legend",
      "sig-reference-page-button", "sig-reference-kpi-alert",
    ]) expect(layout).toContain(token);
    expect(layout).toContain("grid-template-areas: \"marker number subject stage owner deadline pending actions\"");
    expect(source("src/components/platform/CompactProcessRegistry.tsx")).toContain('title={"Abrir " + number}');
    expect(source("src/components/platform/CompactProcessRegistry.tsx")).toContain("markers.slice(0, 2)");
    expect(panel).not.toContain("5.482");
  });
});
