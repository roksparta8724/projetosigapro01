import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const file = (name: string) => readFileSync(name, "utf8");

describe("SIGAPRO — fidelidade visual ao modelo aprovado do Controle de Processos", () => {
  const header = file("src/components/platform/ProcessWorkspaceHeader.tsx");
  const wrapper = file("src/components/platform/PremiumProcessRegistry.tsx");
  const css = file("src/styles/sigapro-process-workspace.css");

  it("inclui os quatro indicadores reais, e não valores inventados do mockup", () => {
    for (const label of ["Processos no município", "Com atenção ao prazo", "Guias pendentes", "Aguardando decisão"]) {
      expect(header).toContain(label);
    }
    expect(header).toContain("processes.filter(processIsCritical).length");
    expect(header).toContain("processes.reduce((v, p) => v + processPendingGuideCount(p), 0)");
    expect(header).not.toContain("5.482");
  });

  it("inclui pesquisa, filtros rápidos, seleção e ações para a ficha oficial", () => {
    for (const text of ["Meus processos", "SLA crítico", "Pendências", "Em decisão", "Todos", "Marcar", "Prioridade", "Atribuir", "Encaminhar", "Decisão", "Etiquetas", "Exportar"]) {
      expect(header).toContain(text);
    }
    expect(header).toContain("Selecionar todos os processos desta página");
    expect(header).toContain("buildProcessPath(oneSelected");
    expect(header).toContain("disabled={!enabled}");
    expect(wrapper).toContain("onBulkMarker");
  });

  it("usa o mesmo painel em todas as mesas, sem componentes inertes", () => {
    for (const path of [
      "src/pages/saas/TenantAdminPage.tsx",
      "src/pages/saas/MunicipalProcessRegistryPage.tsx",
      "src/pages/saas/DashboardHomePage.tsx",
      "src/pages/saas/ProtocolDeskPage.tsx",
      "src/pages/saas/AnalystDeskPage.tsx",
      "src/pages/saas/FinanceProtocolsPage.tsx",
      "src/pages/saas/ExternalProcessControlPage.tsx",
    ]) {
      expect(file(path)).toContain('PremiumProcessRegistry as CompactProcessRegistry');
    }
    expect(wrapper).toContain("<CompactProcessRegistry");
    expect(wrapper).toContain("defaultPageSize={10}");
    expect(wrapper).toContain("onVisiblePageChange={setPageIds}");
  });

  it("respeita o espaço disponível e o leiaute premium no menu lateral", () => {
    expect(css).toContain("container: sig-workspace / inline-size");
    expect(css).toContain("sig-workspace-kpis");
    expect(css).toContain("sig-workspace-filters");
    expect(css).toContain("sig-workspace-actions");
    expect(css).toContain("min-width: 960px");
    expect(file("src/styles/compact-process-registry.css")).not.toContain("min-width: 995px;");
  });
});
