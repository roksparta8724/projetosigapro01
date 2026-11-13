import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(resolve(process.cwd(), "src/pages/saas/DashboardHomePage.tsx"), "utf8");

describe("SIGAPRO — primeira dobra operacional do Dashboard", () => {
  it("mostra os processos municipais antes do plano, indicadores e gráficos", () => {
    const overview = dashboard.split("const renderOverview = () => (")[1]?.split("const renderProcesses = () => (")[0] ?? "";
    expect(overview).toContain("{renderMunicipalWorkQueue()}");
    expect(overview.indexOf("{renderMunicipalWorkQueue()}")).toBeLessThan(
      overview.indexOf("{showPlanCapacity && !isMaster ? renderPlanCapacity() : null}"),
    );
    expect(overview.indexOf("{renderMunicipalWorkQueue()}")).toBeLessThan(
      overview.indexOf('data-sigapro-overview-strip="compact"'),
    );
    expect(dashboard).not.toContain('{section === "visao-geral" && showPlanCapacity && !isMaster ? renderPlanCapacity() : null}');
  });

  it("usa registros oficiais autorizados, sem duplicar a base nem permitir despacho no cartão inicial", () => {
    const queue = dashboard.split("const renderMunicipalWorkQueue = () => {")[1]?.split("const renderOverview = () => (")[0] ?? "";
    expect(queue).toContain("if (isMaster || isExternal) return null;");
    expect(queue).toContain('data-dashboard-operational-first="true"');
    expect(queue).toContain("<CompactProcessRegistry");
    expect(queue).toContain("processes={recentProcesses}");
    expect(queue).toContain("showArchiveAction={false}");
    expect(queue).toContain("canDispatchProcess={() => false}");
    expect(dashboard).toContain("const recentProcesses = useMemo(() => pickRecent(displayProcesses, 6), [displayProcesses]);");
    expect(dashboard).toContain("const displayProcesses = isMaster");
  });

  it("mantém acesso ao conjunto completo pela rota de consulta municipal", () => {
    expect(dashboard).toContain('"/prefeitura/visao-geral/processos"');
    expect(dashboard).toContain("Consultar todos os processos");
    expect(dashboard).toContain("displayProcesses.length.toLocaleString");
  });
});
