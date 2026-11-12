import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const overview = read("src/pages/saas/TenantAdminPage.tsx");
const sidebar = read("src/components/platform/AppSidebar.tsx");
const frame = read("src/components/platform/PortalFrame.tsx");
const organogram = read("src/pages/saas/MunicipalOrganizationPage.tsx");
const css = read("src/styles/municipal-executive-v4.css");

describe("Premium V5: sem branco vazio, sidebar estreita e organograma real", () => {
  it("mantém os controles e a lista de processos no mesmo contêiner compacto", () => {
    const fragment = overview.split('data-sigapro-overview-processes="premium-v5"')[1]
      ?.split('workspaceView === "visao-geral" && overviewSubpage === "pendencias"')[0] ?? "";
    expect(fragment).toContain('data-processes-toolbar="true"');
    expect(fragment).toContain('data-processes-list="true"');
    expect(fragment).toContain('aria-label="Pesquisar processos da Visão Geral"');
    expect(fragment).toContain("<CompactProcessRegistry");
    expect(fragment.indexOf('data-processes-toolbar="true"')).toBeLessThan(fragment.indexOf("<CompactProcessRegistry"));
    expect(fragment).not.toContain("<TableCard");
    expect(fragment).not.toContain("<PageMainContent");
    expect(fragment).toContain("showArchiveAction={false}");
    expect(fragment).toContain("canDispatchProcess={() => false}");
    expect(fragment).toContain('navigate("/prefeitura/processos")');
  });

  it("bloqueia a volta de alturas artificiais nas listagens", () => {
    expect(css).toContain('[data-sigapro-overview-processes="premium-v5"]');
    expect(css).toContain('height: auto !important');
    expect(css).toContain('min-height: 0 !important');
    expect(css).toContain('[data-sei-process-registry="true"]');
    expect(css).not.toContain('height: 117.647');
  });

  it("reduz o menu desktop e mantém a faixa institucional sincronizada", () => {
    expect(sidebar).toContain('"w-[232px]"');
    expect(sidebar).toContain('"w-[76px]"');
    expect(sidebar).toContain('w-[min(88vw,300px)]');
    expect(frame).toContain('sidebarExpanded ? "232px" : "76px"');
    expect(sidebar).toContain('sig-sidebar-scroll');
  });

  it("troca o grande bloco azul vazio do Organograma por dados existentes", () => {
    const header = organogram.split('data-municipal-organization-hero="compact-v5"')[1]
      ?.split('{canEdit ? (\n          <div className="rounded-2xl border')[0] ?? "";
    expect(header).toContain('data-organogram-headline="true"');
    expect(header).toContain("Estrutura da Prefeitura");
    expect(header).toContain('data-organogram-real-counts="true"');
    expect(header).toContain('unit.unitType === "secretaria"');
    expect(header).toContain('departments.length - activeCount');
    expect(header).toContain("Nova unidade");
    expect(organogram).toContain("<MunicipalOrganizationChart");
    expect(organogram).not.toContain("<PageHero");
  });

  it("não troca permissões, dados, dashboard ou documentos", () => {
    expect(organogram).toContain('session.role === "prefeitura_admin"');
    expect(organogram).toContain("upsertRemoteMunicipalDepartment");
    expect(overview).toContain('overviewSubpage === "resumo"');
    expect(read("src/pages/saas/DashboardHomePage.tsx")).toContain("summaryFirst");
    expect(css).not.toContain("canvas {");
    expect(css).not.toContain("iframe {");
  });
});
