// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PremiumProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import { CompactProcessRegistry } from "@/components/platform/CompactProcessRegistry";
import type { ProcessRecord } from "@/lib/platform";

const item = (id: string, options: Record<string, unknown> = {}) => ({
  id, protocol: "PM-2026-" + id.padStart(5, "0"), municipalityId: "municipality-1",
  title: "Licenciamento Urbanístico", status: "analise_tecnica", ownerName: "Proprietário",
  analysis: { assignedTo: "Analista" }, tags: [], requirements: [], dispatches: [], timeline: [],
  payment: { status: "confirmado", guides: [] },
  sla: { currentStage: "Análise Urbanística", dueDate: "24/11/2026", hoursRemaining: 60, breached: false },
  ...options,
}) as unknown as ProcessRecord;
const source = (name: string) => readFileSync(name, "utf8");

describe("SIGAPRO — marcadores com cores semânticas e layout real do controle", () => {
  it("mostra análise azul a partir da etapa oficial sem gravar um marcador", () => {
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[item("1")]} /></MemoryRouter>);
    const marker = container.querySelector('[data-marker-origin="automatic"][data-marker-kind="analise"]');
    expect(marker).toHaveAttribute("title", "Indicador automático: Análise");
    expect(marker).toHaveStyle({ color: "#2563eb" });
    expect(container.querySelector('[data-marker-origin="saved"]')).toBeNull();
  });

  it("respeita prioridade de vermelho/roxo/âmbar com dados reais, sem criar tags", () => {
    const record = item("2", {
      sla: { breached: true, currentStage: "Análise Urbanística" },
      payment: { status: "pendente", guides: [{ status: "pendente" }] },
      requirements: [{ status: "aberta", visibility: "interno" }],
    });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    for (const [kind, color] of [["sla", "#dc2626"], ["guia", "#9333ea"], ["exigencia", "#d97706"]] as const) {
      expect(container.querySelector('[data-marker-kind="' + kind + '"]')).toHaveStyle({ color });
    }
    expect(record.tags).toHaveLength(0);
  });

  it("corrige Vistoria salva com cor legada, mas preserva marcador personalizado", () => {
    const record = item("3", { tags: ["Vistoria::blue", "Prioridade::orange"], sla: { currentStage: "Vistoria" } });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    expect(container.querySelector('[data-marker-origin="saved"][data-marker-kind="vistoria"]')).toHaveStyle({ color: "#7c3aed" });
    expect(container.querySelector('[data-marker-origin="saved"][data-marker-kind="custom"]')).toHaveStyle({ color: "#ea580c" });
  });

  it("não divulga indicadores internos de prazo para visualização externa", () => {
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[item("4", {
      sla: { breached: true, currentStage: "Análise Urbanística" },
    })]} showSensitiveDetails={false} /></MemoryRouter>);
    expect(container.querySelector('[data-marker-origin="automatic"]')).toBeNull();
  });

  it("mantém os filtros cromáticos funcionais e a tabela com uma linha por processo", () => {
    const { container } = render(<MemoryRouter><PremiumProcessRegistry processes={[item("5", {
      sla: { breached: true, currentStage: "Análise Urbanística" },
    }), item("6")]} /></MemoryRouter>);
    expect(container.querySelector('[data-filter="criticos"]')).toBeInTheDocument();
    expect(container.querySelector('[data-filter="decisao"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SLA crítico" }));
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(1);
    const css = source("src/styles/sigapro-reference-layout.css");
    expect(css).toContain('.sig-workspace-chip[data-filter="criticos"]');
    expect(css).toContain('.sig-workspace-chip[data-filter="decisao"]');
    expect(css).toContain("border: 1px solid;");
    expect(css).toContain('grid-template-areas: "marker number subject stage owner deadline pending actions"');
  });
});
