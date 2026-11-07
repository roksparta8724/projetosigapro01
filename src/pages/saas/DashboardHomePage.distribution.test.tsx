import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DistributionCard } from "./DashboardHomePage";
import { BarChart3 } from "lucide-react";

// jsdom não fornece o ResizeObserver exigido pelo ResponsiveContainer
// do Recharts. Simula apenas a API de observação, sem ocultar DOM ou hover.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal("ResizeObserver", MockResizeObserver));
afterAll(() => vi.unstubAllGlobals());

const sample = [
  { label: "Análise técnica", total: 2 },
  { label: "Aprovação de Projeto Residencial", total: 1 },
  { label: "Pendência documental", total: 1 },
];

describe("Dashboard SIGAPRO — distribuição premium responsiva e hover", () => {
  it("mantém donut e legenda sem impor duas colunas na largura do viewport", () => {
    const css = readFileSync("src/index.css", "utf8");
    const dashboard = readFileSync("src/pages/saas/DashboardHomePage.tsx", "utf8");
    const distribution = dashboard.slice(
      dashboard.indexOf("export function DistributionCard("),
      dashboard.indexOf("export function DashboardHomePage()"),
    );

    expect(css).toContain("container-type: inline-size;");
    expect(css).toContain("@container (min-width: 380px)");
    expect(css).toContain("minmax(150px, 0.84fr) minmax(190px, 1.16fr)");
    expect(distribution).toContain('className="sig-dashboard-distribution-layout"');
    expect(distribution).not.toContain("xl:grid-cols-[minmax(0,0.95fr)_minmax(220px,0.85fr)]");
    expect(distribution).not.toContain("<ChartTooltip");
    expect(distribution).toContain("onMouseEnter={(_, index) => setActiveSegment(index)}");
  });

  it("exibe legenda, total e informações de hover dentro do card sem texto vertical", () => {
    const view = render(
      <DistributionCard
        title="Distribuição por tipo"
        description="Classificação de processos"
        icon={BarChart3}
        data={sample}
      />,
    );
    expect(view.container.querySelector(".sig-dashboard-distribution-container")).not.toBeNull();
    expect(view.container.querySelector(".sig-dashboard-distribution-legend")).not.toBeNull();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Todos os registros");
    expect(status).toHaveTextContent("4 registros no recorte");

    const item = screen.getByRole("button", {
      name: "Aprovação de Projeto Residencial: 1 registros",
    });
    fireEvent.mouseEnter(item);
    expect(item).toHaveAttribute("aria-pressed", "true");
    expect(status).toHaveTextContent("Aprovação de Projeto Residencial");
    expect(status).toHaveTextContent("1 de 4 · 25%");

    fireEvent.mouseLeave(item);
    expect(status).toHaveTextContent("Todos os registros");
    expect(status).toHaveTextContent("4 registros no recorte");
  });

  it("permite consultar categorias pelo teclado e mantém estado vazio elegante", () => {
    const { rerender } = render(
      <DistributionCard title="Etapas" description="Etapas críticas" icon={BarChart3} data={sample} />,
    );
    const item = screen.getByRole("button", { name: "Análise técnica: 2 registros" });
    fireEvent.focus(item);
    expect(screen.getByRole("status")).toHaveTextContent("2 de 4 · 50%");
    fireEvent.blur(item);
    expect(screen.getByRole("status")).toHaveTextContent("4 registros no recorte");

    rerender(
      <DistributionCard title="Etapas" description="Etapas críticas" icon={BarChart3} data={[]} />,
    );
    expect(screen.getByText("Sem dados para distribuição")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
