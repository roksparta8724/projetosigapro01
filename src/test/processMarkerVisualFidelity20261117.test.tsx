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

  it("respeita exatamente a cor salva no marcador, mesmo com nome de etapa", () => {
    const record = item("3", { tags: ["Vistoria::blue", "Prioridade::orange"], sla: { currentStage: "Vistoria" } });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    expect(container.querySelector('[data-marker-origin="saved"][data-marker-kind="vistoria"]')).toHaveStyle({ color: "#2563eb" });
    expect(container.querySelector('[data-marker-origin="saved"][data-marker-kind="custom"]')).toHaveStyle({ color: "#ea580c" });
    expect(source("src/components/platform/CompactProcessRegistry.tsx")).toContain("markers.slice(0, 2)");
    expect(source("src/components/platform/CompactProcessRegistry.tsx")).toContain("sig-reference-marker-third");
    const icon = container.querySelector('[data-marker-origin="saved"][data-marker-kind="vistoria"] svg');
    expect(icon).toHaveStyle({ color: "#2563eb", stroke: "#2563eb" });
  });

  it("mantém a cor original de cada etiqueta real de banco sem sobrepor o significado pelo nome", () => {
    const record = item("9", { tags: ["Concluído::green", "Retorno::red", "Prioridade::gold"] });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    expect(container.querySelector('[data-marker-origin="saved"][data-marker-kind="concluido"]')).toHaveStyle({ color: "#16a34a" });
    expect(container.querySelector('[data-marker-origin="saved"][data-marker-kind="custom"]')).toHaveStyle({ color: "#dc2626" });
    expect(record.tags).toEqual(["Concluído::green", "Retorno::red", "Prioridade::gold"]);
  });

  it("não divulga indicadores internos de prazo para visualização externa", () => {
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[item("4", {
      sla: { breached: true, currentStage: "Análise Urbanística" },
    })]} showSensitiveDetails={false} /></MemoryRouter>);
    expect(container.querySelector('[data-marker-origin="automatic"]')).toBeNull();
  });

  it("os filtros da referência trabalham com status, guias e etapas reais", () => {
    const records = [
      item("10", { payment: { status: "pendente", guides: [{ status: "pending" }] } }),
      item("11", { requirements: [{ status: "aberta" }] }),
      item("12", { status: "triagem", sla: { currentStage: "Vistoria", hoursRemaining: 40, breached: false } }),
      item("13", { status: "distribuicao", sla: { currentStage: "Aguardando decisão do Diretor", hoursRemaining: 40, breached: false } }),
    ];
    const { container } = render(<MemoryRouter><PremiumProcessRegistry processes={records} operatorName="Analista" /></MemoryRouter>);
    for (const [filter, count] of [["guias", 1], ["exigencias", 1], ["vistoria", 1], ["decisao", 1], ["analise", 2]] as const) {
      const button = container.querySelector<HTMLButtonElement>('[data-filter="' + filter + '"]');
      expect(button, filter).not.toBeNull();
      fireEvent.click(button!);
      expect(container.querySelectorAll('[data-sei-process-row="true"]'), filter).toHaveLength(count);
    }
    for (const label of ["Meus processos", "SLA crítico", "Guia pendente", "Exigência", "Análise", "Vistoria", "Em decisão", "Todos"]) {
      expect(container.querySelector(".sig-workspace-filters")?.textContent).toContain(label);
    }
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
