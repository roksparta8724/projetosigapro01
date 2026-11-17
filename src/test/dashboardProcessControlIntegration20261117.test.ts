import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO — integração real do controle de processos ao Dashboard", () => {
  const dashboard = source("src/pages/saas/DashboardHomePage.tsx");
  const municipalityRegistry = source("src/pages/saas/MunicipalProcessRegistryPage.tsx");
  const routes = source("src/App.tsx");

  it("exibe o controle operacional completo acima do hero, sem limitar aos seis recentes", () => {
    expect(dashboard).toContain('section === "visao-geral" ? renderMunicipalWorkQueue() : null');
    expect(dashboard.indexOf('section === "visao-geral" ? renderMunicipalWorkQueue() : null'))
      .toBeLessThan(dashboard.indexOf('data-dashboard-hero="compact-v6"'));
    expect(dashboard).toContain('processes={remoteSyncedForCurrentUser ? tenantProcesses : []}');
    expect(dashboard).not.toContain("processes={recentProcesses}");
    expect(dashboard).toContain('data-dashboard-operational-first="true"');
  });

  it("encaminha para a rota real de controle municipal com autorização", () => {
    expect(dashboard).toContain('navigate("/prefeitura/processos")');
    expect(routes).toContain('path="/prefeitura/processos"');
    expect(routes).toContain("<MunicipalProcessRegistryPage />");
    expect(municipalityRegistry).toContain('remoteSyncedForCurrentUser ? allProcesses : []');
    expect(municipalityRegistry).toContain("matchesOperationalScope(effectiveScopeId, process)");
  });

  it("não apresenta dados locais como oficiais antes da sincronização por usuário", () => {
    expect(dashboard).toContain("remoteSyncedForCurrentUser");
    expect(dashboard).toContain('data-dashboard-process-sync="pending"');
    expect(dashboard).toContain("refreshRemoteStore()");
    expect(dashboard).toContain("session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId");
    expect(dashboard).toContain("setDashboardSelectedProcessIds([])");
  });

  it("liga seleção e marcação à permissão setorial e ao registro auditável", () => {
    expect(dashboard).toContain("selectedProcessIds={dashboardSelectedProcessIds}");
    expect(dashboard).toContain("onToggleSelection={(processId, checked)");
    expect(dashboard).toContain("isProcessOwnedBySessionDepartment(session, process)");
    expect(dashboard).toContain('session.role === "prefeitura_admin"');
    expect(dashboard).toContain("selected.length > 25");
    expect(dashboard).toContain("await addProcessMarkerWithColor(process.id, marker.label, marker.color, session.name)");
    expect(dashboard).toContain('onBulkMarker={session.role === "prefeitura_admin" ? undefined : applyDashboardMarker}');
    expect(dashboard).toContain("showArchiveAction={false}");
  });

  it("mantém a mesma tabela premium responsiva nas duas entradas", () => {
    expect(dashboard).toContain("<CompactProcessRegistry");
    expect(municipalityRegistry).toContain("<CompactProcessRegistry");
    const workspace = source("src/components/platform/PremiumProcessRegistry.tsx");
    expect(workspace).toContain('data-sigapro-process-workspace="approved-premium-mockup"');
    expect(workspace).toContain("defaultPageSize={10}");
    expect(workspace).toContain("onVisiblePageChange={setPageIds}");
  });
});
