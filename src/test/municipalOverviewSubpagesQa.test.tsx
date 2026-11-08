import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MunicipalOverviewSubnav } from "@/components/platform/MunicipalOverviewSubnav";
import {
  MUNICIPAL_OVERVIEW_SUBPAGES,
  isMunicipalOverviewSubpagePath,
  municipalOverviewSubpageFromPath,
} from "@/lib/municipalOverviewSubpages";

describe("SIGAPRO QA — Visão Geral da Prefeitura com subpáginas reais", () => {
  it("mantém resumo no endereço existente e identifica processos, pendências e atividades por URL", () => {
    expect(municipalOverviewSubpageFromPath("/prefeitura")).toBe("resumo");
    expect(municipalOverviewSubpageFromPath("/prefeitura/visao-geral/processos")).toBe("processos");
    expect(municipalOverviewSubpageFromPath("/prefeitura/visao-geral/pendencias/")).toBe("pendencias");
    expect(municipalOverviewSubpageFromPath("/prefeitura/visao-geral/atividades")).toBe("atividades");
    expect(isMunicipalOverviewSubpagePath("/prefeitura/visao-geral/processos")).toBe(true);
    expect(isMunicipalOverviewSubpagePath("/prefeitura/financeiro")).toBe(false);
    expect(MUNICIPAL_OVERVIEW_SUBPAGES).toHaveLength(4);
  });

  it("exibe links diretos acessíveis sem expandir cards, com contadores de milhares", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/prefeitura/visao-geral/processos"]}>
        <MunicipalOverviewSubnav active="processos" counts={{
          processos: 2000, pendencias: 431, atividades: 3000,
        }} />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Subpáginas da Visão Geral" });
    expect(nav.querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Processos/ })).toHaveAttribute(
      "href", "/prefeitura/visao-geral/processos",
    );
    expect(screen.getByRole("link", { name: /Processos/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("2.000")).toBeInTheDocument();
    expect(screen.getByText("3.000")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-sigapro-overview-subpages]")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Pendências/ })).toHaveAttribute(
      "href", "/prefeitura/visao-geral/pendencias",
    );
  });

  it("preserva os mesmos guardas municipais nas rotas novas, sem conceder edição ao administrador", () => {
    const routes = readFileSync("src/App.tsx", "utf8");
    const begin = routes.indexOf('path="/prefeitura/visao-geral/:subpage"');
    expect(begin).toBeGreaterThan(0);
    const section = routes.slice(begin, begin + 330);
    expect(section).toContain('permission="manage_tenant_users"');
    expect(section).toContain('module="Configurações"');
    expect(section).toContain("<TenantAdminPage />");

    const page = readFileSync("src/pages/saas/TenantAdminPage.tsx", "utf8");
    expect(page).toContain("isNestedOverview");
    expect(page).toContain('setWorkspaceView("visao-geral")');
    expect(page).toContain("persistInUrl={!isNestedOverview}");
    expect(page).toContain("MunicipalOverviewSubnav active={overviewSubpage}");
    expect(page).toContain('overviewSubpage === "processos"');
    expect(page).toContain('overviewSubpage === "pendencias"');
    expect(page).toContain('overviewSubpage === "atividades"');
    expect(page).toContain("showArchiveAction={false}");
    expect(page).toContain("canDispatchProcess={() => false}");
  });

  it("mantém listas limitadas, pesquisa por página e dados concluídos fora da fila ativa", () => {
    const page = readFileSync("src/pages/saas/TenantAdminPage.tsx", "utf8");
    const list = readFileSync("src/components/platform/CompactProcessRegistry.tsx", "utf8");
    expect(page).toContain("orderedAllProcesses");
    expect(page).toContain("overviewProcessStatus === \"concluidos\"");
    expect(page).toContain("const mainQueue = useMemo(() => orderedAllProcesses.filter");
    expect(page).toContain("overviewActivityPageData.items.map");
    expect(page).toContain("paginateMunicipalItems(recentActivity, overviewActivityPage, 15)");
    expect(list).toContain("paginateMunicipalItems(processes, page, 25)");
    expect(list).toContain("pageData.items.map((process)");
    expect(list).toContain("xl:grid-cols-[30px_");
    expect(list).not.toContain("lg:grid-cols-[30px_");
    expect(page).toContain("mainQueue.slice(0, 3)");
    expect(page).toContain("actionRequired.slice(0, 2)");
    expect(page).toContain("recentActivity.slice(0, 3)");
    expect(page).toContain('data-sigapro-plan-overview="compact"');
  });
});
