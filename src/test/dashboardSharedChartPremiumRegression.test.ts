import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const chart = read("src/components/ui/chart.tsx");
const dashboard = read("src/pages/saas/DashboardHomePage.tsx");
const css = read("src/index.css");
const master = read("src/pages/saas/MasterAdminPage.tsx");
const municipal = read("src/pages/saas/TenantAdminPage.tsx");
const external = read("src/pages/saas/ExternalPortalPage.tsx");

describe("SIGAPRO QA — auditoria premium dos Dashboards por perfil", () => {
  it("não desmonta SVGs/hover ao receber ResizeObserver em qualquer Dashboard", () => {
    expect(chart).toContain('<RechartsPrimitive.ResponsiveContainer width="100%" height="100%" debounce={120}>');
    expect(chart).not.toContain("setContainerKey");
    expect(chart).not.toContain("key={containerKey}");
    expect(chart).not.toContain("hostRef.current");
    expect(chart).toContain("ref={ref}");
  });

  it("define a largura do tooltip e não oculta contagem zero", () => {
    expect(chart).toContain("sig-chart-tooltip grid w-max min-w-[10rem]");
    expect(chart).toContain("max-w-[min(17rem,calc(100vw-2rem))]");
    expect(chart).toContain("flex-nowrap");
    expect(chart).toContain("item.value !== undefined && item.value !== null");
    expect(chart).toContain("whitespace-nowrap font-mono");
  });

  it("mantém as roscas dos cinco Dashboards com largura útil e sem balão móvel", () => {
    expect(css).toContain(".sig-dashboard-distribution-container {");
    expect(css).toContain("container-type: inline-size;");
    expect(css).toContain("@container (min-width: 520px)");
    expect(css).toContain("grid-template-columns: minmax(200px, 0.9fr) minmax(250px, 1.1fr);");
    expect(dashboard).toContain('min-[2150px]:grid-cols-2');
    expect(dashboard).toContain('min-[2150px]:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]');
    expect(dashboard).not.toContain('className="grid gap-6 2xl:grid-cols-2"');
    expect(dashboard.match(/<DistributionCard/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("posiciona tooltips temporais dentro dos gráficos para não cortarem textos", () => {
    expect(dashboard.match(/position={{ x: 12, y: 12 }}/g)?.length).toBe(3);
    expect(dashboard).toContain('title="Evolução de movimentações"');
    expect(dashboard).toContain('title="Situação financeira"');
    expect(dashboard).toContain('title="Distribuição por perfil"');
    expect(dashboard).toContain('title="Etapas com maior pressão"');
  });

  it("preserva dashboards Master, prefeitura e profissional no mesmo sistema de cards premium", () => {
    expect(master).toContain("MetricCard");
    expect(municipal).toContain("PageStatsRow");
    expect(external).toContain("MetricCard");
    expect(dashboard).toContain("MetricCard");
    expect(dashboard).toContain("isMaster");
    expect(dashboard).toContain("isExternalProfessionalRole");
    expect(dashboard).toContain("prefeitura_admin");
  });
});
