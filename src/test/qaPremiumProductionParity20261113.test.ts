import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("SIGAPRO — homologação premium integrada ao código oficial", () => {
  it("Prefeitura abre pela fila operacional, como na prévia revisada pelo usuário", () => {
    const code = read("src/pages/saas/TenantAdminPage.tsx");
    expect(code).toContain('useState<WorkspaceView>("fila")');
    expect(code).toContain('label: "Fila operacional"');
    expect(code).toContain('data-sigapro-overview-summary="premium-v4"');
  });
  it("Dashboard mostra processos reais no primeiro quadro", () => {
    const code=read("src/pages/saas/DashboardHomePage.tsx");
    expect(code).toContain('data-dashboard-operational-first="true"');
    expect(code).toContain("CompactProcessRegistry");
    expect(code).toContain("renderMunicipalWorkQueue");
  });
  it("Organograma e Mesa Técnica têm layout compacto e relatório no mesmo pacote", () => {
    expect(read("src/pages/saas/MunicipalOrganizationPage.tsx")).toContain('data-municipal-organization-hero="compact-v5"');
    expect(read("src/pages/saas/AnalystDeskPage.tsx")).toContain('from "@/lib/analysisQueueReport"');
    expect(read("src/pages/saas/AnalystDeskPage.tsx")).toContain('import "@/styles/analysis-workspace.css"');
    expect(read("src/lib/analysisQueueReport.ts")).toContain("buildAnalysisQueueExportRows");
  });
  it("ativa as três camadas de CSS premium por ordem no entrypoint principal", () => {
    const main=read("src/main.tsx");
    const names=["institutional-premium-v3.css","municipal-executive-v4.css","dashboard-topbar-premium-v6.css"];
    let last=main.indexOf('import "./index.css"');
    for(const name of names){
      const idx=main.indexOf('import "./styles/'+name+'";');
      expect(idx).toBeGreaterThan(last);
      last=idx;
      expect(existsSync(resolve(process.cwd(),"src/styles",name))).toBe(true);
    }
    expect(read("src/components/platform/PortalFrame.tsx")).toContain('data-premium-design="institutional-v3"');
    expect(read("src/components/platform/PageLayout.tsx")).toContain("data-summary-position");
  });
  it("não promove a migração bancária experimental nem substitui guardas de autenticação", () => {
    expect(existsSync(resolve(process.cwd(),"neon/migrations/20261113_mp_production_activation_guarded_v1.sql"))).toBe(false);
    expect(read("src/components/platform/SeamlessRefreshGate.tsx")).toContain("canRefreshMountedWorkspace");
    expect(read("src/App.tsx")).toContain("<PermissionRoute permission=");
    expect(read("src/lib/seamlessInternalRefresh.ts")).toContain("event.navigationType !== \"reload\"");
  });
});
