import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("SIGAPRO QA — Prefeitura mostra apenas um cabeçalho institucional", () => {
  it("preserva o brasão do PortalFrame e elimina a segunda faixa com o nome municipal", () => {
    const frame = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
    const municipal = readFileSync("src/pages/saas/TenantAdminPage.tsx", "utf8");

    expect(frame).toContain("<InstitutionalLogo");
    expect(frame).toContain("institutionDisplayName");
    expect(municipal).toContain('<PortalFrame eyebrow="Administração da Prefeitura"');
    expect(municipal).not.toContain('sig-dark-panel overflow-hidden rounded-[30px]');
    expect(municipal).not.toContain("Centro institucional da operação municipal, com governança");
    expect(municipal).toContain('<PageStatsRow className="xl:grid-cols-4">');
    expect(municipal).toContain('workspaceView === "visao-geral"');
    expect(municipal).toContain('data-sigapro-overview-quickfacts="true"');
  });

  it("não bloqueia a gestão de usuários nem o acesso à identidade visual", () => {
    const municipal = readFileSync("src/pages/saas/TenantAdminPage.tsx", "utf8");
    expect(municipal).toContain("CompactUserRegistry");
    expect(municipal).toContain("Criar servidor");
    expect(municipal).toContain('navigate("/configuracoes?secao=branding")');
    expect(municipal).toContain("Consumo do plano da Prefeitura");
  });
});
