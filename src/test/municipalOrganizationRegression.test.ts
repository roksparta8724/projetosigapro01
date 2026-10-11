import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tenantAdmin = readFileSync(resolve(root, "src/pages/saas/TenantAdminPage.tsx"), "utf8");
const backend = readFileSync(resolve(root, "src/integrations/backend/platformImpl.ts"), "utf8");
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

  it("persists parent hierarchy and municipality scope in the database", () => {
    expect(migration).toContain("parent_department_id uuid");
    expect(migration).toContain("upsert_municipal_department_v1");
    expect(migration).toContain("assign_profile_department_v1");
    expect(migration).toContain("can_manage_municipality");
  });
});
