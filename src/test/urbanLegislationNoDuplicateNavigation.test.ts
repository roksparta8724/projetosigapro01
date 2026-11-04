import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("SIGAPRO — gestão legislativa sem cabeçalhos ou menus duplicados", () => {
  const sidebar = read("src/components/platform/PortalFrame.tsx");
  const config = read("src/pages/saas/ConfiguracoesPage.tsx");
  const app = read("src/App.tsx");
  it("keeps the dedicated legal subpage only inside Cadastro e Gestão", () => {
    const master = sidebar.slice(sidebar.indexOf('key: "dashboard-master"'), sidebar.indexOf('key: "master-plans"'));
    const cadastro = sidebar.slice(sidebar.indexOf('key: "settings"'), sidebar.indexOf('key: "collection"'));
    expect(master).not.toContain("/cadastro-gestao/legislacao");
    expect(master).not.toContain("children:");
    expect(cadastro).toContain('to: "/cadastro-gestao/legislacao"');
    expect(sidebar.match(/to: "\/cadastro-gestao\/legislacao"/g)).toHaveLength(1);
    expect(app).toContain('path="/cadastro-gestao/legislacao"');
    expect(app).toContain("allowedRoles={URBAN_LEGISLATION_VIEW_ROLES}");
  });
  it("uses the shared institutional banner as its only page heading", () => {
    const start = config.indexOf("  if (legislationWorkspace) {");
    const end = config.indexOf("  return (\n    <PortalFrame eyebrow=\"Configurações institucionais\"", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const page = config.slice(start, end);
    expect(page).not.toContain("<PageHeader");
    expect(page).toContain('data-urban-legislation-dedicated-page="true"');
    expect(page).toContain("Acervo legal oficial");
    expect(page).not.toContain("Acervo municipal e parametrização");
    expect(page).toContain("selectedTenantId ? legalArchiveWorkspace");
  });
  it("does not repeat the earlier introduction before the document registry", () => {
    const first = config.indexOf("  const legalArchiveWorkspace = (");
    const end = config.indexOf("  if (legislationWorkspace) {", first);
    const section = config.slice(first, end);
    expect(section).not.toContain("Documentos complementares — cadastro individual e sem limite fixo de campos");
    expect(section).toContain("<UrbanLegislationRegistryPanel municipalityId={selectedTenantId} />");
    expect(section).toContain('id="sigapro-legal-archive-upload"');
    expect(section).toContain("<MunicipalUrbanRulesSettings");
  });
});
