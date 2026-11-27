import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("SIGAPRO — usuários da prefeitura acima da dobra, sem painel vazio", () => {
  const page = read("src/pages/saas/TenantAdminPage.tsx");
  const frame = read("src/components/platform/PortalFrame.tsx");
  const css = read("src/styles/institutional-premium-v3.css");

  it("abre a guia de usuários do link direto na primeira renderização sem mostrar fila ou banner anterior", () => {
    expect(page).toContain('new URLSearchParams(location.search).get("secao")');
    expect(page).toContain('hideSectionHeader={workspaceView === "usuarios"}');
    expect(frame).toContain("!focusMode && !hideSectionHeader");
    expect(page).toContain('<PortalFrame eyebrow="Administração da Prefeitura"');
  });

  it("usa uma faixa horizontal de indicadores e põe a tabela imediatamente após filtros", () => {
    const usersStart = page.indexOf('{workspaceView === "usuarios" ? (');
    const nextView = page.indexOf('{workspaceView === "organograma" ? (', usersStart);
    expect(usersStart).toBeGreaterThan(0);
    expect(nextView).toBeGreaterThan(usersStart);
    const users = page.slice(usersStart, nextView);
    expect(users).toContain('data-municipal-users-list-first="premium-v6"');
    expect(users).toContain('data-municipal-users-summary="compact-v6"');
    expect(users).toContain("<CompactUserRegistry");
    expect(users).not.toContain("<PageStatsRow");
    expect(users.indexOf("CompactUserRegistry")).toBeGreaterThan(users.indexOf('data-municipal-users-summary="compact-v6"'));
    expect(users).toContain('!h-auto !min-h-0 !self-start');
  });

  it("não reinicia a consulta protegida sempre que processos ou outros usuários atualizam no store", () => {
    expect(page).toContain("workspaceView, municipalRegistryRefresh]);");
    expect(page).not.toContain("workspaceView, municipalRegistryRefresh, sessionUsers]);");
    expect(page).toContain("setMunicipalRegistryRefresh((current) => current + 1);");
    expect(page).toContain("listRemoteMunicipalUserRegistry()");
  });

  it("não inventa zero durante sincronização e mantém tabela e edição presentes", () => {
    const users = page.slice(page.indexOf('{workspaceView === "usuarios" ? ('), page.indexOf('{workspaceView === "organograma" ? ('));
    expect(users).toContain('municipalRegistryConfirmed ? tenantUsers.length : "—"');
    expect(users).toContain("data-municipal-users-sync=");
    expect(page).toContain('navigate("/prefeitura/usuarios/novo")');
    expect(users).toContain("renderDetails={renderUserCard}");
    expect(users).toContain("label=\"Usuários da Prefeitura\"");
  });

  it("mantém layout responsivo e contraste legível em tema escuro", () => {
    expect(page).toContain('bg-[#123d5b]');
    expect(page).toContain("font-semibold tabular-nums text-white");
    expect(page).toContain("flex min-w-0 flex-wrap items-center gap-x-4");
    expect(css).toContain("grid-auto-rows: max-content !important");
  });
});
