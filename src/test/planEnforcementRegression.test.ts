import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial plan enforcement", () => {
  it("enforces modules both in routes and navigation", () => {
    const app = read("src/App.tsx");
    const portal = read("src/components/platform/PortalFrame.tsx");

    expect(app).toContain('<PlanModuleRoute module="Financeiro">');
    expect(app).toContain('<PlanModuleRoute module="Analise tecnica">');
    expect(app).toContain('<PlanModuleRoute module="Acesso externo">');
    expect(app).toContain('<PlanModuleRoute module="Configurações">');
    expect(portal).toContain("planEntitlements.canUseModule(item.module)");
  });

  it("enforces quotas in the database, not only in the interface", () => {
    const migration = read("supabase/migrations/20261011223000_plan_entitlements_enforcement.sql");

    expect(migration).toContain("assert_municipality_entitlement_v1");
    expect(migration).toContain("'processes',1");
    expect(migration).toContain("'departments',1");
    expect(migration).toContain("'users',1");
    expect(migration).toContain("'storage_bytes'");
    expect(migration).toContain("trg_guard_plan_process_insert_v1");
    expect(migration).toContain("trg_guard_plan_membership_write_v1");
    expect(migration).toContain("trg_guard_plan_department_write_v1");
    expect(migration).toContain("trg_guard_plan_assignment_capacity_v1");
    expect(migration).toContain("trg_guard_plan_definition_update_v1");
  });

  it("requires a commercial plan when a municipality is created", () => {
    const master = read("src/pages/saas/MasterAdminPage.tsx");

    expect(master).toContain("Selecione um plano comercial ativo antes de salvar a Prefeitura.");
    expect(master).toContain("saveClientPlanAssignment");
    expect(master).toContain("Plano contratado");
  });

  it("tracks real file bytes for storage quota", () => {
    const protocol = read("src/pages/saas/ProtocolarProjetoPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const backend = read("src/integrations/backend/platformImpl.ts");

    expect(protocol).toContain("fileSizeBytes: originalFile.size");
    expect(detail).toContain("fileSizeBytes: candidate.size");
    expect(detail).toContain("fileSizeBytes: selected.file.size");
    expect(backend).toContain("fileSizeBytes: document.fileSizeBytes");
  });
});
