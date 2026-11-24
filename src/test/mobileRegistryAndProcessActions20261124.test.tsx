// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { ProcessWorkspaceHeader } from "@/components/platform/ProcessWorkspaceHeader";

const read = (path: string) => readFileSync(path, "utf8");
const sources = {
  adaptive: read("src/styles/sigapro-adaptive-registries-20261124.css"),
  process: read("src/styles/sigapro-responsive-process-workspace-20261124.css"),
  header: read("src/components/platform/ProcessWorkspaceHeader.tsx"),
  portfolio: read("src/components/platform/CompactPortfolioRegistry.tsx"),
  users: read("src/components/platform/CompactUserRegistry.tsx"),
  premium: read("src/components/platform/PremiumProcessRegistry.tsx"),
};

const common = {
  processes: [],
  filteredCount: 0,
  search: "",
  onSearch: vi.fn(),
  quickFilter: "todos" as const,
  onFilter: vi.fn(),
  operatorName: "Operador de teste",
  canFilterUnit: false,
  selectedCount: 0,
  allPageSelected: false,
  pageCount: 0,
  onTogglePage: vi.fn(),
  onClearSelection: vi.fn(),
  oneSelected: null,
  canDispatch: () => false,
  bulkBusy: false,
  markerOptions: [],
  onExport: vi.fn(),
  embedded: true,
};

describe("SIGAPRO — regressão real de cards mobile, tablet e departamentos", () => {
  it("só mostra ações administrativas para perfis que podem operá-las", () => {
    const { container, rerender } = render(
      <MemoryRouter><ProcessWorkspaceHeader {...common} showSensitiveDetails={false}/></MemoryRouter>,
    );
    expect(container.querySelector('[data-sigapro-process-bulk-actions="true"]')).toBeNull();
    expect(container.querySelector('[data-sigapro-process-readonly-hint="true"]'))
      .toHaveTextContent("Consulta de processos");
    expect(screen.getByRole("group", { name: "Filtros rápidos" })).toBeInTheDocument();

    rerender(<MemoryRouter><ProcessWorkspaceHeader {...common} showSensitiveDetails={true}/></MemoryRouter>);
    expect(container.querySelector('[data-sigapro-process-bulk-actions="true"]')).toBeInTheDocument();
    expect(container.querySelector('[data-sigapro-process-readonly-hint="true"]')).toBeNull();
    expect(screen.getByRole("button", { name: /Concluir nesta unidade/i })).toBeDisabled();
  });

  it("mantém filtros utilizáveis e sem ações ocultas por rolagem horizontal", () => {
    const onFilter = vi.fn();
    render(<MemoryRouter><ProcessWorkspaceHeader {...common} showSensitiveDetails={false} onFilter={onFilter}/></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Meus processos/i }));
    expect(onFilter).toHaveBeenCalledWith("meus");
    expect(sources.process).toContain("overflow: visible !important");
    expect(sources.process).toContain(".sig-workspace-actions-list");
    expect(sources.process).toContain(".sig-workspace-filters");
  });

  it("as CSS são válidas e os breakpoints contemplam o print em 812px", () => {
    expect(() => postcss.parse(sources.adaptive)).not.toThrow();
    expect(() => postcss.parse(sources.process)).not.toThrow();
    expect(sources.process).toContain("@media (max-width: 1023px)");
    expect(sources.process).toContain("@media (max-width: 520px)");
    expect(sources.adaptive).toContain("@container sigapro-portfolio (max-width: 920px)");
    expect(sources.adaptive).toContain("@container sigapro-users (max-width: 920px)");
    expect(sources.adaptive).toContain(".sig-finance-ledger__filters");
  });

  it("preserva os mesmos registros, detalhes, paginação e acesso oficial", () => {
    expect(sources.portfolio).toContain('data-mobile-label="Prefeitura"');
    expect(sources.users).toContain('data-mobile-label="Usuário"');
    expect(sources.portfolio.match(/renderDetails\(institution\)/g)).toHaveLength(1);
    expect(sources.premium).toContain('import "@/styles/sigapro-responsive-process-workspace-20261124.css"');
    expect(sources.premium).toContain('<CompactProcessRegistry');
    expect(sources.process).toContain('"marker number"');
    expect(sources.process).toContain('"actions actions" !important');
    expect(sources.process).toContain(".sig-process-cell-label");
    expect(sources.process).toContain(".sig-reference-footer");
  });
});
