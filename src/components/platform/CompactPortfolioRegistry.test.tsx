import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompactPortfolioRegistry } from "@/components/platform/CompactPortfolioRegistry";
import type { Institution } from "@/lib/platform";

const cities: Institution[] = Array.from({ length: 240 }, (_, index) => ({
  id: "municipality-test-" + index,
  name: "Prefeitura " + String(index+1).padStart(3,"0"),
  city: "Cidade " + index,
  state: "SP",
  plan: index % 3 === 0 ? "Avançado" : "Essencial",
  subdomain: "cidade-" + index,
  status: index % 19 === 0 ? "suspenso" : "ativo",
  activeModules: [],
  users: 20,
  processes: 200,
  revenue: 0,
  theme: {primary:"#123",accent:"#456"},
}));

describe("SIGAPRO Master — carteira de 240 municípios sem cards empilhados", () => {
  it("monta somente 12 linhas e nenhum detalhe sem solicitação", () => {
    const expand = vi.fn((item: Institution) => <div data-testid="full-card">{item.name}</div>);
    const { container } = render(<CompactPortfolioRegistry institutions={cities} renderDetails={expand} />);
    expect(container.querySelectorAll("[data-sigapro-portfolio-row]")).toHaveLength(12);
    expect(screen.getByText(/Página 1 de 20/)).toBeInTheDocument();
    expect(expand).not.toHaveBeenCalled();
  });

  it("permite detalhar exatamente um município e paginar sem carregar fichas antigas", () => {
    const { container } = render(<CompactPortfolioRegistry institutions={cities}
      renderDetails={(item) => <div data-testid="full-card">{item.name}</div>} />);
    fireEvent.click(screen.getAllByRole("button",{name:"Detalhes"})[0]);
    expect(container.querySelectorAll("[data-sigapro-portfolio-details]")).toHaveLength(1);
    expect(screen.getByTestId("full-card")).toHaveTextContent("Prefeitura 001");
    fireEvent.click(screen.getByRole("button",{name:"Próxima"}));
    expect(container.querySelectorAll("[data-sigapro-portfolio-row]")).toHaveLength(12);
    expect(container.querySelectorAll("[data-sigapro-portfolio-details]")).toHaveLength(0);
    expect(screen.getByText("Prefeitura 013")).toBeInTheDocument();
  });

  it("distingue municípios suspensos de municípios em implantação", () => {
    const partial: Institution[] = [{...cities[0],status:"suspenso"}, {...cities[1],status:"implantacao"}];
    render(<CompactPortfolioRegistry institutions={partial} renderDetails={() => null} />);
    expect(screen.getByText("Suspensa")).toBeInTheDocument();
    expect(screen.getByText("Em implantação")).toBeInTheDocument();
  });
});
