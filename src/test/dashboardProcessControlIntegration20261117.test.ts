import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO — Controle de Processos único, conforme referência aprovada", () => {
  const dashboard = source("src/pages/saas/DashboardHomePage.tsx");
  const municipality = source("src/pages/saas/MunicipalProcessRegistryPage.tsx");
  const routes = source("src/App.tsx");
  const workspace = source("src/components/platform/PremiumProcessRegistry.tsx");
  const header = source("src/components/platform/ProcessWorkspaceHeader.tsx");
  const layout = source("src/styles/sigapro-reference-layout.css");

  it("remove o controle operacional duplicado do Dashboard, mantendo seus indicadores", () => {
    expect(dashboard).not.toContain("renderMunicipalWorkQueue");
    expect(dashboard).not.toContain("<CompactProcessRegistry");
    expect(dashboard).not.toContain('data-dashboard-operational-first="true"');
    expect(dashboard).toContain('data-dashboard-hero="compact-v6"');
    expect(dashboard).toContain('data-sigapro-overview-strip="compact"');
  });

  it("mantém acesso ao único controle municipal pela rota protegida", () => {
    expect(dashboard).toContain('navigate(isMaster ? "/dashboard/processos" : "/prefeitura/processos")');
    expect(routes).toContain('path="/prefeitura/processos"');
    expect(routes).toContain("<MunicipalProcessRegistryPage />");
    expect(municipality).toContain("matchesOperationalScope(effectiveScopeId, process)");
    expect(municipality).toContain("remoteSyncedForCurrentUser ? allProcesses : []");
    expect(municipality).toContain('title="Processos da Prefeitura" hideSectionHeader');
  });

  it("não duplica cabeçalho institucional, métricas, busca nem filtros na página exclusiva", () => {
    expect(municipality.match(/<CompactProcessRegistry/g) ?? []).toHaveLength(1);
    for (const duplicate of ["<PageHeader", "<PageStatsRow", "<StatCard", "<Input",
      "data-sei-bulk-selection", "setSearch(", "setFilter("]) {
      expect(municipality, duplicate).not.toContain(duplicate);
    }
    expect(workspace).toContain('<ProcessWorkspaceHeader');
    expect(workspace).toContain("defaultPageSize={10}");
    const frame = source("src/components/platform/PortalFrame.tsx");
    expect(frame).toContain("hideSectionHeader = false");
    expect(frame).toContain("!focusMode && !hideSectionHeader");
  });

  it("segue a imagem: quatro indicadores, oito filtros, ações e tabela em uma linha no desktop", () => {
    expect(header).toContain("Controle de Processos");
    for (const label of ["Processos no município", "Com atenção ao prazo",
      "Guias pendentes", "Aguardando decisão", "Meus processos",
      "SLA crítico", "Guia pendente", "Exigência", "Análise", "Vistoria", "Em decisão", "Todos", "Marcar",
      "Prioridade", "Atribuir", "Encaminhar", "Decisão", "Etiquetas", "Exportar"]) {
      expect(header).toContain(label);
    }
    expect(layout).toContain('grid-template-areas: "marker number subject stage owner deadline pending actions"');
    expect(layout).toContain("flex-wrap: nowrap");
    expect(layout).toContain("white-space: nowrap");
    expect(source("src/components/platform/CompactProcessRegistry.tsx")).toContain('data-sigapro-process-control="premium-table"');
  });

  it("isola operações oficiais de usuários readonly e conserva arquivo pessoal", () => {
    expect(municipality).toContain('session.role === "prefeitura_admin" ? undefined : applyMarkerToSelected');
    expect(municipality).toContain("isProcessOwnedBySessionDepartment(session, process)");
    expect(municipality).toContain("selectedIds.size > 25");
    expect(municipality).toContain("await addProcessMarkerWithColor(");
    expect(municipality).toContain("composeProfessionalMarkerLabel(marker.label, marker.emoji)");
    expect(municipality).toContain('data-sei-personal-archive-controls="true"');
    expect(municipality).toContain("sem alterar tramitação ou status oficial");
    expect(header).toContain("(oneSelected && canDispatch(oneSelected))");
    expect(header).toContain("!showSensitiveDetails || !onBulkMarker");
    expect(header).not.toContain("!dispatch || canDispatch(oneSelected)");
  });
});
