import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tenantAdmin = readFileSync(resolve(root, "src/pages/saas/TenantAdminPage.tsx"), "utf8");
const masterAdmin = readFileSync(resolve(root, "src/pages/saas/MasterAdminPage.tsx"), "utf8");
const backend = readFileSync(resolve(root, "src/integrations/backend/platformImpl.ts"), "utf8");
const orgChart = readFileSync(resolve(root, "src/components/platform/MunicipalOrganizationChart.tsx"), "utf8");
const orgPage = readFileSync(resolve(root, "src/pages/saas/MunicipalOrganizationPage.tsx"), "utf8");
const portalFrame = readFileSync(resolve(root, "src/components/platform/PortalFrame.tsx"), "utf8");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20261011195500_municipal_organization_chart.sql"),
  "utf8",
);

describe("municipal organization chart", () => {
  it("lets the municipality build its own hierarchy", () => {
    expect(tenantAdmin).toContain('value: "organograma"');
    expect(tenantAdmin).toContain("Organograma municipal");
    expect(tenantAdmin).toContain("Unidade superior");
    expect(tenantAdmin).toContain("Secretaria");
    expect(tenantAdmin).toContain("Diretoria");
    expect(tenantAdmin).toContain("Departamento");
    expect(tenantAdmin).toContain("Setor");
    expect(tenantAdmin).toContain("Coordenadoria");
  });

  it("keeps department and job title separate when editing a municipal user", () => {
    expect(tenantAdmin).toContain("Cargo / função");
    expect(tenantAdmin).toContain("Departamento no organograma");
    expect(tenantAdmin).toContain("assignRemoteProfileDepartment");
    expect(backend).toContain("assign_profile_department_v1");
  });

  it("lets the Master configure the organogram inside each selected municipality", () => {
    expect(masterAdmin).toContain('value: "organograma"');
    expect(masterAdmin).toContain("Organograma •");
    expect(masterAdmin).toContain("activeTenant.name");
    expect(masterAdmin).toContain("handleMasterCreateDepartment");
    expect(masterAdmin).toContain("handleMasterAssignDepartment");
    expect(masterAdmin).toContain("As alterações ficam somente na Prefeitura selecionada.");
  });

  it("shows the institutional hierarchy with department names and acronyms without staff names", () => {
    expect(tenantAdmin).toContain("MunicipalOrganizationChart");
    expect(orgChart).toContain("getMunicipalDepartmentAcronym");
    expect(orgChart).toContain("{department.name}");
    expect(orgChart).toContain("unidade superior cadastrada no banco");
    expect(orgChart).toContain("nomes de servidores continuam fora desta visão");
    expect(orgChart).not.toContain("user.name");
  });

  it("exposes a read-only organogram to every internal municipal user", () => {
    expect(orgPage).toContain("isInternalRole");
    expect(orgPage).toContain("listRemoteMunicipalDepartments");
    expect(portalFrame).toContain('to: "/prefeitura/organograma"');
    expect(portalFrame).toContain("internalOnly: true");
  });

  it("reads departments through a scoped RPC instead of direct table access", () => {
    expect(backend).toContain('db.rpc("list_internal_municipal_departments_v1"');
  });

  it("persists parent hierarchy and municipality scope in the database", () => {
    expect(migration).toContain("parent_department_id uuid");
    expect(migration).toContain("upsert_municipal_department_v1");
    expect(migration).toContain("assign_profile_department_v1");
    expect(migration).toContain("can_manage_municipality");
  });
});
