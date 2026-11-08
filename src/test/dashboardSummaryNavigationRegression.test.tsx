import { useState } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { InternalSectionNav } from "@/components/platform/PageLayout";
import { InternalTabs } from "@/components/platform/InternalTabs";

const paths = [
  { value: "/dashboard", label: "Visão geral", helper: "Resumo executivo" },
  { value: "/dashboard/processos", label: "Processos", helper: "Fluxo e distribuição" },
];

function DashboardRouteHarness() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div>
      <InternalSectionNav items={paths} value={location.pathname} onChange={(path) => navigate(path)} summaryFirst staticSelection />
      <output data-testid="route">{location.pathname}{location.search}</output>
    </div>
  );
}

function MasterTabHarness() {
  const [value, setValue] = useState("visao-geral");
  return (
    <div>
      <InternalTabs
        items={[
          { value: "visao-geral", label: "Visão geral" },
          { value: "carteira", label: "Carteira" },
          { value: "usuarios", label: "Usuários" },
        ]}
        value={value}
        onChange={setValue}
        urlParam="secao"
        summaryFirst
      />
      <output data-testid="master-section">{value}</output>
    </div>
  );
}

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("dashboard nav must not redirect away from Visão geral", () => {
  it("remains in Visão geral after selecting it from Processos", () => {
    render(<MemoryRouter initialEntries={["/dashboard/processos"]}><DashboardRouteHarness /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /visão geral/i }));
    expect(screen.getByTestId("route")).toHaveTextContent("/dashboard");
    expect(screen.getByRole("button", { name: /visão geral/i })).toHaveAttribute("data-nav-active", "true");
    const nav = screen.getByRole("button", { name: /visão geral/i }).closest("section");
    expect(nav).toHaveAttribute("data-summary-first", "true");
    expect(nav?.querySelector("button")?.textContent).toContain("Visão geral");
  });

  it("does not allow legacy secao search params to override a clicked tab", () => {
    render(<MemoryRouter initialEntries={["/dashboard?secao=%2Fdashboard%2Fprocessos"]}>
      <DashboardRouteHarness />
    </MemoryRouter>);
    expect(screen.getByRole("button", { name: /visão geral/i })).toHaveAttribute("data-nav-active", "true");
    fireEvent.click(screen.getByRole("button", { name: /processos/i }));
    expect(screen.getByTestId("route")).toHaveTextContent("/dashboard/processos");
    fireEvent.click(screen.getByRole("button", { name: /visão geral/i }));
    expect(screen.getByRole("button", { name: /visão geral/i })).toHaveAttribute("data-nav-active", "true");
  });

  it("keeps the dashboard mounted on one route while each operational module stays gated", () => {
    const app = read("src/App.tsx");
    const dashboard = read("src/pages/saas/DashboardHomePage.tsx");
    expect(app).toContain('path="/dashboard/*"');
    expect(app).not.toContain('path="/dashboard/processos"');
    expect(app).not.toContain('path="/dashboard/financeiro"');
    expect(dashboard).toContain('<PlanModuleRoute module="Protocolo digital">');
    expect(dashboard).toContain('<PlanModuleRoute module="Financeiro">');
    expect(dashboard).toContain("staticSelection");
    expect(dashboard).toContain("summaryFirst");
  });

  it("does not mount the InternalTabs auto-redirect on Dashboard", () => {
    const dashboard = read("src/pages/saas/DashboardHomePage.tsx");
    expect(dashboard).not.toContain("<InternalTabs");
    expect(dashboard).toContain("<InternalSectionNav");
    expect(dashboard).toContain("showPlanCapacity && !isMaster ? renderPlanCapacity() : null");
    expect(dashboard.indexOf("showPlanCapacity && !isMaster ? renderPlanCapacity()"))
      .toBeLessThan(dashboard.indexOf("<InternalSectionNav"));
  });

  it("renders Visão geral as the first tab also on the Master dashboard", () => {
    render(<MemoryRouter initialEntries={["/master"]}><MasterTabHarness /></MemoryRouter>);
    const nav = screen.getByRole("button", { name: /visão geral/i }).closest("section");
    expect(nav).toHaveAttribute("data-summary-first", "true");
    expect(nav?.querySelector("button")?.textContent).toContain("Visão geral");
  });

  it("renders the first declared tab first even without the explicit summaryFirst prop", () => {
    render(<MemoryRouter initialEntries={["/master"]}><InternalTabs
      items={[{ value: "visao-geral", label: "Visão geral" }, { value: "fila", label: "Fila" }, { value: "historico", label: "Histórico" }]}
      value="visao-geral" onChange={() => {}} persistInUrl={false} /></MemoryRouter>);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Visão geral");
  });

  it("keeps the Master Visão geral open with no query parameter", () => {
    render(<MemoryRouter initialEntries={["/master"]}><MasterTabHarness /></MemoryRouter>);
    expect(screen.getByTestId("master-section")).toHaveTextContent("visao-geral");
    expect(screen.getByRole("button", { name: /visão geral/i })).toHaveAttribute("data-nav-active", "true");
    fireEvent.click(screen.getByRole("button", { name: /carteira/i }));
    expect(screen.getByTestId("master-section")).toHaveTextContent("carteira");
    fireEvent.click(screen.getByRole("button", { name: /visão geral/i }));
    expect(screen.getByTestId("master-section")).toHaveTextContent("visao-geral");
  });

  it("honors an explicitly requested Master section", () => {
    render(<MemoryRouter initialEntries={["/master?secao=usuarios"]}><MasterTabHarness /></MemoryRouter>);
    expect(screen.getByTestId("master-section")).toHaveTextContent("usuarios");
    expect(screen.getByRole("button", { name: /usuários/i })).toHaveAttribute("data-nav-active", "true");
  });

  it("limits Master overview contract cards and preserves navigation to the full portfolio", () => {
    const dashboard = read("src/pages/saas/DashboardHomePage.tsx");
    expect(dashboard).toContain("showPlanCapacity && isMaster ? renderPlanCapacity() : null");
    expect(dashboard).toContain("planCapacity.rows.slice(0, isMaster ? 2 : undefined)");
    expect(dashboard).toContain('navigate("/master?secao=carteira")');
    expect(dashboard).toContain("Capacidade contratada por Prefeitura");
  });

  it("keeps municipal overview responsive while removing duplicate KPI cards", () => {
    const tenant = read("src/pages/saas/TenantAdminPage.tsx");
    const cards = read("src/components/platform/PageLayout.tsx");
    const history = read("src/pages/saas/TenantAdminPage.tsx");
    const externalTabs = read("src/lib/externalTabs.ts");
    expect(tenant).toContain("data-municipal-activity-card");
    expect(tenant).toContain("MunicipalActivityCard key=");
    expect(tenant).toContain("municipalActivityTitle(item.title)");
    expect(tenant).toContain("min-[2150px]:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]");
    expect(tenant).toContain('data-sigapro-overview-quickfacts="true"');
    expect(tenant).toContain('data-sigapro-overview-unit-summary="compact"');
    expect(tenant).toContain('mainQueue.slice(0, 3).map((process) => (');
    expect(dashboard).toContain('data-sigapro-overview-strip="compact"');
    expect(tenant).not.toContain("lg:grid-cols-[minmax(260px,1.55fr)");
    expect(cards).toContain("[overflow-wrap:anywhere]");
    expect(history).toContain("min-[2050px]:grid-cols-");
    expect(externalTabs.indexOf('value: "visao"')).toBeLessThan(externalTabs.indexOf('value: "controle"'));
  });

  it("shows remaining places and remaining percentage together", () => {
    const card = read("src/components/platform/PlanCapacityCard.tsx");
    expect(card).toContain("metric.remainingLabel");
    expect(card).toContain("data-plan-remaining-percent={metric.key}");
    expect(card).toContain("100 - metric.percentage");
  });
});
