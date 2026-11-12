import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { InternalSectionNav } from "@/components/platform/PageLayout";
import { MunicipalOverviewSubnav } from "@/components/platform/MunicipalOverviewSubnav";
import { MUNICIPAL_OVERVIEW_SUBPAGES } from "@/lib/municipalOverviewSubpages";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const navItems = [
  { value: "visao-geral", label: "Visão geral", helper: "Resumo" },
  { value: "fila", label: "Fila", helper: "Operação" },
  { value: "historico", label: "Histórico", helper: "Registro" },
];

function contrast(front: string, back: string) {
  const l = (v: string) => {
    const cs = [1, 3, 5].map((idx) => {
      const n = parseInt(v.slice(idx, idx + 2), 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    return .2126 * cs[0] + .7152 * cs[1] + .0722 * cs[2];
  };
  return (Math.max(l(front), l(back)) + .05) / (Math.min(l(front), l(back)) + .05);
}

describe("SIGAPRO v4 — resumo sempre no fim, exceto no Dashboard", () => {
  it("normaliza resumo por último mesmo quando o módulo o declarou primeiro", () => {
    const { container } = render(
      <InternalSectionNav items={navItems} value="fila" onChange={() => {}} />,
    );
    const root = container.querySelector('[data-summary-position="last"]');
    expect(root).toBeInTheDocument();
    const buttons = within(root as HTMLElement).getAllByRole("button");
    expect(buttons.map((node) => node.querySelector(".sig-nav-item-label")?.textContent)).toEqual(["Fila", "Histórico", "Visão geral"]);
    expect(buttons[0]).toHaveAttribute("data-nav-active", "true");
  });

  it("mantém somente o Dashboard com resumo na primeira posição", () => {
    const { container } = render(
      <InternalSectionNav items={navItems} value="visao-geral" onChange={() => {}} summaryFirst />,
    );
    const root = container.querySelector('[data-summary-position="first"]');
    expect(root).toBeInTheDocument();
    expect(within(root as HTMLElement).getAllByRole("button")[0]).toHaveTextContent("Visão geral");
  });

  it("a Prefeitura tem subpáginas operacionais em primeiro lugar e o resumo como último link", () => {
    expect(MUNICIPAL_OVERVIEW_SUBPAGES.map((item) => item.key)).toEqual([
      "processos", "pendencias", "atividades", "resumo",
    ]);
    render(
      <MemoryRouter initialEntries={["/prefeitura/visao-geral/processos"]}>
        <MunicipalOverviewSubnav active="processos" counts={{ processos: 5, pendencias: 1, atividades: 10 }} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/prefeitura/visao-geral/processos");
    expect(links[links.length - 1]).toHaveAttribute("href", "/prefeitura/visao-geral/resumo");
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });

  it("os módulos começam no fluxo operacional; Dashboard mantém a visão geral", () => {
    const tenant = read("src/pages/saas/TenantAdminPage.tsx");
    expect(tenant).toContain('useState<WorkspaceView>("fila")');
    expect(tenant).toContain('navigate("/prefeitura/visao-geral/processos")');
    expect(read("src/pages/saas/MasterAdminPage.tsx")).toContain('useState<WorkspaceView>("carteira")');
    expect(read("src/pages/saas/FinanceDeskPage.tsx")).toContain('useState<FinanceSection>("guias")');
    expect(read("src/pages/saas/ProtocolDeskPage.tsx")).toContain('useState<ProtocolSection>("fila")');
    expect(read("src/pages/saas/AnalystDeskPage.tsx")).toContain('      : "fila";');
    expect(read("src/pages/saas/DashboardHomePage.tsx")).toContain("summaryFirst");
  });

  it("o resumo municipal não monta mais seis cards brancos e mantém operações essenciais", () => {
    const tenant = read("src/pages/saas/TenantAdminPage.tsx");
    const summary = tenant.split('data-sigapro-overview-summary="premium-v4"')[1]
      ?.split('{workspaceView === "visao-geral" && overviewSubpage === "processos"')[0] || "";
    expect(summary).toContain('data-sigapro-summary-board="dark"');
    expect(summary).toContain('data-sigapro-overview-quickfacts="true"');
    expect(summary).toContain('mainQueue.slice(0, 3).map((process) => (');
    expect(summary).toContain('data-municipal-triage-divergence="true"');
    expect(summary).toContain("MunicipalActivityCard key=");
    expect(summary).toContain('data-sigapro-overview-unit-summary="compact"');
    expect(summary).not.toContain("<PageMainGrid");
    expect(summary).not.toContain("<SectionCard");
  });

  it("a navegação é uma faixa horizontal compacta e painéis se ajustam ao conteúdo", () => {
    const layout = read("src/components/platform/PageLayout.tsx");
    expect(layout).toContain('min-h-[52px]');
    expect(layout).toContain("snap-mandatory flex-nowrap");
    expect(layout).not.toContain("sig-section-card flex h-full");
    expect(layout).toContain('"min-w-0 max-w-full pt-3 [overflow-wrap:anywhere]"');
  });

  it("assegura contraste forte nas superfícies institucionais e preserva ações e PDF", () => {
    const css = read("src/styles/municipal-executive-v4.css");
    const main = read("src/main.tsx");
    expect(main.indexOf('import "./styles/municipal-executive-v4.css"'))
      .toBeGreaterThan(main.indexOf('import "./styles/institutional-premium-v3.css"'));
    expect(css).toContain('[data-sigapro-summary-board="dark"]');
    expect(css).toContain('[data-sigapro-overview-subpages="true"]');
    expect(css).not.toContain("canvas {");
    expect(css).not.toContain(".sig-premium-topbar");
    expect(css).not.toContain(".sig-sidebar-shell");
    expect(contrast("#ffffff", "#0a2a43")).toBeGreaterThan(11);
    expect(contrast("#123650", "#edf4fa")).toBeGreaterThan(9);
  });
});
