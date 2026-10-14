import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("premium municipal workspace regression", () => {
  const organization = read("src/components/platform/MunicipalOrganizationChart.tsx");
  const organizationPage = read("src/pages/saas/MunicipalOrganizationPage.tsx");
  const tenantAdmin = read("src/pages/saas/TenantAdminPage.tsx");
  const shell = read("src/components/platform/PortalFrame.tsx");
  const protocol = read("src/pages/saas/ProtocolDeskPage.tsx");
  const analyst = read("src/pages/saas/AnalystDeskPage.tsx");
  const finance = read("src/pages/saas/FinanceDeskPage.tsx");
  const main = read("src/main.tsx");
  const internalTabs = read("src/components/platform/InternalTabs.tsx");

  it("renders the organogram from the real parent-child hierarchy", () => {
    expect(organization).toContain("item.parentDepartmentId === department.id");
    expect(organization).toContain("!item.parentDepartmentId || !activeIds.has(item.parentDepartmentId)");
    expect(organization).toContain("unidade superior cadastrada no banco");
    expect(organization).toContain("{department.name}");
    expect(organization).toContain("getDepartmentAcronym");
    expect(organization).toContain("Vínculo circular detectado");
    expect(organization).not.toContain("Estrutura institucional por siglas.");
  });

  it("prevents invalid self/descendant parent selections in organogram editing", () => {
    expect(tenantAdmin).toContain("getDescendantDepartmentIds");
    expect(tenantAdmin).toContain("forbiddenParentDepartmentIds");
    expect(tenantAdmin).toContain("availableParentDepartments");
    expect(tenantAdmin).toContain("Departamentos e setores ficam visualmente dentro da unidade superior cadastrada");
  });

  it("uses the authenticated municipality first for municipal employees", () => {
    expect(organizationPage).toContain(
      "session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null",
    );
    expect(tenantAdmin).toContain(
      "session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null",
    );
  });

  it("never labels internal municipal users by external professional type", () => {
    expect(shell).toContain("const externalSessionRole");
    expect(shell).toContain("session.profileLabel?.trim() || session.title?.trim() || roleLabels[session.role]");
    expect(shell).toContain("const itemIsExternal");
    expect(shell).toContain("item.profileLabel?.trim() || item.title?.trim() || roleLabels[item.role]");
  });

  it("places Protocol under Administration in the administrative sidebar", () => {
    expect(shell).toContain("const protocolAdministrativeItem");
    expect(shell).toContain('item.to === "/prefeitura/protocolos"');
    expect(shell).toContain("...(protocolAdministrativeItem ? [protocolAdministrativeItem] : [])");
    expect(shell).toContain('item.to !== "/prefeitura/protocolos"');
  });

  it("uses department-aware institutional labels in shell and footer", () => {
    expect(shell).toContain('secretaria: "Secretaria de Administração", diretoria: "Departamento de Protocolo"');
    expect(shell).toContain('"Secretaria de Urbanismo e Obras"');
    expect(shell).toContain('"Departamento de Análise Urbanística"');
    expect(shell).toContain("const institutionFooterUnit");
    expect(shell).toContain("{institutionFooterUnit}");
  });

  it("keeps operational desks on premium card surfaces", () => {
    expect(protocol).toContain("shadow-[0_10px_24px_rgba(15,23,42,0.055)]");
    expect(protocol).toContain("rounded-[22px]");
    expect(analyst).toContain("shadow-[0_10px_24px_rgba(15,23,42,0.055)]");
    expect(finance).toContain("shadow-[0_10px_24px_rgba(15,23,42,0.055)]");
  });

  it("keeps F5 native and preserves tabs in the URL without scroll traps", () => {
    expect(main).toContain('window.history.scrollRestoration = "auto"');
    expect(main).not.toContain("window.scrollTo");
    expect(main).not.toContain("persistVisualSnapshot");
    expect(main).not.toContain("requestAnimationFrame(waitForStableFrame)");
    expect(internalTabs).toContain("preventScrollReset: true");
    expect(internalTabs).toContain('urlParam = "secao"');
  });
});
