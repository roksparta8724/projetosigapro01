import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { InternalSectionNav } from "@/components/platform/PageLayout";

const paths = [
  { value: "/dashboard", label: "Visão geral", helper: "Resumo executivo" },
  { value: "/dashboard/processos", label: "Processos", helper: "Fluxo e distribuição" },
];

function DashboardRouteHarness() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div>
      <InternalSectionNav items={paths} value={location.pathname} onChange={(path) => navigate(path)} />
      <output data-testid="route">{location.pathname}{location.search}</output>
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

  it("does not mount the InternalTabs auto-redirect on Dashboard", () => {
    const dashboard = read("src/pages/saas/DashboardHomePage.tsx");
    expect(dashboard).not.toContain("<InternalTabs");
    expect(dashboard).toContain("<InternalSectionNav");
    expect(dashboard).toContain("showPlanCapacity && !isMaster ? renderPlanCapacity() : null");
    expect(dashboard.indexOf("showPlanCapacity && !isMaster ? renderPlanCapacity()"))
      .toBeLessThan(dashboard.indexOf("<InternalSectionNav"));
  });

  it("still keeps one list of all municipal plans for Master on overview", () => {
    const dashboard = read("src/pages/saas/DashboardHomePage.tsx");
    expect(dashboard).toContain("showPlanCapacity && isMaster ? renderPlanCapacity() : null");
    expect(dashboard).toContain("planCapacity.rows.map");
    expect(dashboard).toContain("Capacidade contratada por Prefeitura");
  });

  it("shows remaining places and remaining percentage together", () => {
    const card = read("src/components/platform/PlanCapacityCard.tsx");
    expect(card).toContain("metric.remainingLabel");
    expect(card).toContain("data-plan-remaining-percent={metric.key}");
    expect(card).toContain("100 - metric.percentage");
  });
});
