import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const config = read("src/pages/saas/ConfiguracoesPage.tsx");
const page = read("src/pages/saas/LegislationPage.tsx");
const app = read("src/App.tsx");
const navigation = read("src/components/platform/PortalFrame.tsx");
const registry = read("src/components/platform/UrbanLegislationRegistryPanel.tsx");

describe("SIGAPRO premium legal page separation", () => {
  it("routes legal management only under Cadastro e Gestão", () => {
    expect(app).toContain('path="/cadastro-gestao/legislacao"');
    expect(app).toContain("<ConfiguracoesPage legislationWorkspace />");
    expect(navigation).toContain('{ to: "/cadastro-gestao/legislacao", label: "Gestão de leis e parâmetros", icon: ScrollText }');
    expect(navigation).not.toContain('{ to: "/legislacao/gestao",');
    expect(navigation).toContain('to: "/configuracoes",');
    expect(navigation).toContain('to: "/master",');
    expect(config).toContain("if (legislationWorkspace) {");
    expect(config).toContain('data-urban-legislation-dedicated-page="true"');
    expect(config).not.toContain('title="Gestão de leis e parâmetros urbanísticos"');
    expect(config).toContain("Acervo legal oficial");
  });
  it("keeps the existing institutional legacy PDFs and urban rules outside branding", () => {
    expect(config).toContain('const legalArchiveWorkspace = (');
    const brandingReturn = config.slice(config.indexOf('<PortalFrame eyebrow="Configurações institucionais"'));
    expect(brandingReturn).not.toContain('id="sigapro-legal-archive-upload"');
    expect(brandingReturn).not.toContain("<MunicipalUrbanRulesSettings");
    expect(brandingReturn).toContain("Salvar identidade visual");
    expect(brandingReturn).not.toContain('navigate("/cadastro-gestao/legislacao")');
    expect(config).toContain('onClick={() => navigate("/configuracoes")}');
  });
  it("saves logos separately without overwriting legal PDFs, and vice versa", () => {
    expect(config).toContain('handleSaveInstitutionalAssets("branding")');
    expect(config).toContain('handleSaveInstitutionalAssets("legislation")');
    expect(config).toContain('...(kind === "branding" ? {');
    expect(config).toContain('...(kind === "legislation" ? {');
    expect(config).toContain('skipMunicipalityBranding: kind === "legislation"');
    expect(config).toContain('disabled={!canManageLegislation}');
  });
  it("does not cram the legal registry into the home summary or a narrow sidebar", () => {
    expect(page).not.toContain("<UrbanLegislationRegistryPanel");
    expect(page).not.toContain('to="/cadastro-gestao/legislacao"');
    expect(page).not.toContain('to="/legislacao/gestao"');
    expect(page).toContain('grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3');
    expect(page).toContain("overflow-hidden rounded-[20px]");
    expect(page).toContain('title={item.fileName || "Sem arquivo oficial"}');
    expect(registry).toContain("max-w-full overflow-hidden");
    expect(registry).toContain("[overflow-wrap:anywhere]");
  });
  it("keeps municipal admin read-only within legal management", () => {
    expect(config).toContain('const canManageLegislation = canEditUrbanLegislationManagement(session.role)');
    expect(app).toContain('allowedRoles={URBAN_LEGISLATION_VIEW_ROLES}');
    expect(config).toContain('canEdit={canManageLegislation}');
  });
});
