import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const css = read("src/styles/sigapro-mobile-cards-premium-20261124.css");
const portfolio = read("src/components/platform/CompactPortfolioRegistry.tsx");
const master = read("src/pages/saas/MasterAdminPage.tsx");
const main = read("src/main.tsx");

describe("SIGAPRO — cards mobile premium sem truncamento", () => {
  it("importa regras responsivas por ultimo e sem mudar o desktop", () => {
    expect(main.indexOf("sigapro-mobile-cards-premium-20261124.css"))
      .toBeGreaterThan(main.indexOf("sigapro-mobile-legibility-20261121.css"));
    expect(css).toContain("@media (max-width: 1023px)");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("@media (max-width: 359px)");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("white-space: normal !important");
  });
  it("nao corta valores e titulos em indicadores compartilhados", () => {
    expect(read("src/components/platform/MetricCard.tsx")).toContain('data-mobile-premium-card="metric"');
    expect(read("src/components/platform/StatCard.tsx")).toContain('data-mobile-premium-card="stat"');
    expect(css).toContain("line-clamp: unset !important");
    expect(read("src/components/platform/PageLayout.tsx")).toContain("sig-stats-row grid min-w-0");
    expect(read("src/components/platform/PlanCapacityCard.tsx")).toContain("[overflow-wrap:anywhere]");
  });
  it("carteira de prefeituras apresenta municipio, plano, status e detalhes em cards", () => {
    expect(portfolio).toContain('data-mobile-portfolio-scroll="true"');
    expect(portfolio).toContain('data-mobile-label="Município"');
    expect(portfolio).toContain('data-mobile-label="Plano"');
    expect(portfolio).toContain('data-mobile-label="Situação"');
    expect(portfolio).toContain('data-sigapro-portfolio-details-row="true"');
    expect(portfolio.match(/renderDetails\(institution\)/g)).toHaveLength(1);
    expect(css).toContain('[data-sigapro-portfolio-registry="compact"] table > tbody');
  });
  it("Master e Prefeitura ficam responsivos sem alterar os botoes de negocio", () => {
    expect(master).toContain('data-master-institution-card="true"');
    expect(master).toContain('data-master-user-card="true"');
    expect(master).toContain('const handleSavePlanOnly = async () => {');
    expect(css).toContain('[data-master-institution-card],[data-master-user-card]');
    expect(css).toContain('[data-sigapro-overview-quickfacts="true"]');
  });
});
