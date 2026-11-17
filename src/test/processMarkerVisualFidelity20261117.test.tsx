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

  it("apresenta só um automático apesar de prazo crítico, guia e exigência simultâneos", () => {
    const record = item("2", {
      sla: { breached: true, currentStage: "Análise Urbanística" },
      payment: { status: "pendente", guides: [{ status: "pendente" }] },
      requirements: [{ status: "aberta", visibility: "interno" }],
    });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    const automatic = container.querySelectorAll('[data-marker-origin="automatic"]');
    expect(automatic).toHaveLength(1);
    expect(automatic[0]).toHaveAttribute("title", "Indicador automático: Análise");
    expect(automatic[0]).toHaveStyle({ color: "#2563eb" });
    expect(container.querySelectorAll('[data-marker-origin="saved"]')).toHaveLength(0);
    expect(screen.getByText("1 exig.")).toBeInTheDocument();
    expect(screen.getByText("1 guia(s)")).toBeInTheDocument();
    expect(record.tags).toHaveLength(0);
  });

  it("marcadores dos profissionais sempre mantêm texto, cor e ordem sem deduplicação", () => {
    const record = item("3", {
      status: "analise_tecnica",
      tags: ["Vistoria::blue", "Prioridade::orange", "Análise::violet"],
      sla: { currentStage: "Vistoria" },
    });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    expect(container.querySelectorAll('[data-marker-origin="automatic"]')).toHaveLength(1);
    expect(container.querySelector('[data-marker-origin="automatic"]')).toHaveAttribute("title", "Indicador automático: Vistoria");
    const saved = [...container.querySelectorAll<HTMLElement>('[data-marker-origin="saved"]')];
    expect(saved).toHaveLength(3);
    expect(saved.map(el => el.getAttribute("title"))).toEqual(["Vistoria", "Prioridade", "Análise"]);
    expect(saved[0]).toHaveStyle({ color: "#2563eb" });
    expect(saved[1]).toHaveStyle({ color: "#ea580c" });
    expect(saved[2]).toHaveStyle({ color: "#7c3aed" });
    expect(record.tags).toEqual(["Vistoria::blue", "Prioridade::orange", "Análise::violet"]);
    expect(container.querySelectorAll('[aria-label^="Ver "][aria-label$=" do processo"]')).toHaveLength(2);
    expect(saved[0].querySelector("svg")).toHaveStyle({ stroke: "#2563eb" });
    expect(source("src/components/platform/CompactProcessRegistry.tsx")).toContain("markers.slice(0, 2)");
  });

  it("cor exata dos registros reais não é substituída por cores semânticas", () => {
    const record = item("9", { tags: ["Concluído::green", "Retorno::red", "Prioridade::gold"] });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    const saved = container.querySelectorAll<HTMLElement>('[data-marker-origin="saved"]');
    expect(saved).toHaveLength(3);
    expect(saved[0]).toHaveStyle({ color: "#16a34a" });
    expect(saved[1]).toHaveStyle({ color: "#dc2626" });
    expect(saved[2]).toHaveStyle({ color: "#ca8a04" });
    // The third saved color remains in the record and in the overflow menu;
    // responsive presentation does not delete or recolor the marker.
    expect(source("src/components/platform/CompactProcessRegistry.tsx")).toContain("style={{ color: extra.color }}");
    expect(record.tags).toEqual(["Concluído::green", "Retorno::red", "Prioridade::gold"]);
  });

  it("mantém símbolo profissional definido, inclusive para outra pessoa em outro computador", () => {
    const record = item("15", { tags: ["⭐ Favorito::cyan", "📍 Vistoria::violet"] });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    const saved = container.querySelectorAll<HTMLElement>('[data-marker-origin="saved"]');
    expect(saved).toHaveLength(2);
    expect(saved[0]).toHaveAttribute("title", "Favorito");
    expect(saved[0]).toHaveStyle({ color: "#0891b2" });
    expect(saved[0].querySelector(".sig-reference-custom-emoji")).toHaveTextContent("⭐");
    expect(saved[1].querySelector(".sig-reference-custom-emoji")).toHaveTextContent("📍");
    expect(record.tags).toEqual(["⭐ Favorito::cyan", "📍 Vistoria::violet"]);
  });

  it("para processo deferido, status final prevalece sobre informação antiga de etapa", () => {
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[item("16", {
      status: "deferido", sla: { currentStage: "Análise Urbanística" },
      tags: ["Prioridade::red"],
    })]} /></MemoryRouter>);
    expect(container.querySelectorAll('[data-marker-origin="automatic"]')).toHaveLength(1);
    expect(container.querySelector('[data-marker-origin="automatic"]')).toHaveAttribute("title", "Indicador automático: Deferido");
    expect(container.querySelector('[data-marker-origin="automatic"]')).toHaveStyle({ color: "#16a34a" });
    expect(container.querySelector('[data-marker-origin="saved"]')).toHaveStyle({ color: "#dc2626" });
  });

  it("consulta externa recebe somente situação oficial, sem inferir prazo ou setor internos", () => {
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[item("4", {
      status: "distribuicao",
      sla: { breached: true, currentStage: "Aguardando decisão do Diretor" },
    })]} showSensitiveDetails={false} /></MemoryRouter>);
    expect(container.querySelectorAll('[data-marker-origin="automatic"]')).toHaveLength(1);
    expect(container.querySelector('[data-marker-origin="automatic"]')).toHaveAttribute("title", "Indicador automático: Distribuição");
    expect(container.querySelector('[data-marker-kind="decisao"]')).toBeNull();
  });

  it("registros além da largura disponível continuam acessíveis em um menu", () => {
    const record = item("8", { tags: ["Prioridade::red", "Retorno::blue", "Favorito::cyan", "Concluído::green"] });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    expect(container.querySelectorAll('[data-marker-origin="automatic"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-marker-origin="saved"]')).toHaveLength(3);
    expect(container.querySelectorAll('[aria-label^="Ver "][aria-label$=" do processo"]')).toHaveLength(2);
    expect(record.tags).toHaveLength(4);
  });

  it("exibe 1 situação automática e 3 individuais — quatro símbolos em uma linha", () => {
    const record = item("21", {
      status: "analise_tecnica",
      tags: ["Retorno::gold", "⭐ Favorito::cyan", "📍 Vistoria::violet"],
    });
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[record]} /></MemoryRouter>);
    const automatic = container.querySelectorAll('[data-marker-origin="automatic"]');
    const individual = container.querySelectorAll('[data-marker-origin="saved"]');
    expect(automatic).toHaveLength(1);
    expect(individual).toHaveLength(3);
    expect(container.querySelector(".sig-reference-marker-fourth")).toHaveAttribute("title", "Vistoria");
    expect(individual[0]).toHaveStyle({ color: "#ca8a04" });
    expect(individual[1].querySelector(".sig-reference-custom-emoji")).toHaveTextContent("⭐");
    expect(individual[2].querySelector(".sig-reference-custom-emoji")).toHaveTextContent("📍");
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
