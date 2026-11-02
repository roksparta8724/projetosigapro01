import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { InternalTabs } from "@/components/platform/InternalTabs";

const paths = [
  { value: "/dashboard", label: "Visão geral", helper: "Resumo executivo" },
  { value: "/dashboard/processos", label: "Processos", helper: "Fluxo e distribuição" },
];

function DashboardNavigationHarness() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div>
      <InternalTabs
        items={paths}
        value={location.pathname}
        onChange={(path) => navigate(path)}
        persistInUrl={false}
      />
      <output data-testid="current-route">{location.pathname}{location.search}</output>
    </div>
  );
}

describe("Dashboard Visão geral navigation", () => {
  it("does not force the summary screen back to Processos", () => {
    render(<MemoryRouter initialEntries={["/dashboard/processos"]}>
      <DashboardNavigationHarness />
    </MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: /visão geral/i }));
    expect(screen.getByTestId("current-route")).toHaveTextContent("/dashboard");
    expect(screen.getByRole("button", { name: /visão geral/i })).toHaveAttribute("data-nav-active", "true");
  });

  it("ignores stale secao query parameters, because routes own the selected tab", () => {
    render(<MemoryRouter initialEntries={["/dashboard?secao=%2Fdashboard%2Fprocessos"]}>
      <DashboardNavigationHarness />
    </MemoryRouter>);
    expect(screen.getByRole("button", { name: /visão geral/i })).toHaveAttribute("data-nav-active", "true");
    fireEvent.click(screen.getByRole("button", { name: /processos/i }));
    expect(screen.getByTestId("current-route")).toHaveTextContent("/dashboard/processos");
  });

  it("keeps the correction local to the dashboard instead of changing other InternalTabs users", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "src/pages/saas/DashboardHomePage.tsx"), "utf8");
    expect(dashboard).toMatch(/<InternalTabs[\s\S]*?persistInUrl=\{false\}/);
    const generic = readFileSync(resolve(process.cwd(), "src/components/platform/InternalTabs.tsx"), "utf8");
    expect(generic).toContain("persistInUrl = true");
  });
});
