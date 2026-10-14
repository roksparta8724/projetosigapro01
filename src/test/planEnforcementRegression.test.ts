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

  it("never treats stale account data as a missing commercial plan during account switching", () => {
    const route = read("src/components/platform/PlanModuleRoute.tsx");
    const hook = read("src/hooks/usePlanEntitlements.ts");
    const data = read("src/hooks/usePlatformData.tsx");

    expect(data).toContain("dataReadyForCurrentUser");
    expect(data).toContain("remoteContextUserId === authenticatedUserId");
    expect(hook).toContain("isResolving");
    expect(hook).toContain("!dataReadyForCurrentUser");
    expect(hook).toContain("isBackgroundRefreshing");
    expect(hook).toContain("(municipalityLoading || platformDataLoading)");
    expect(route).toContain("if (entitlements.isResolving)");
    expect(route.indexOf("if (entitlements.isResolving)")).toBeLessThan(
      route.indexOf('const planName = entitlements.plan?.name ?? "não configurado"'),
    );
    expect(route).not.toContain("Validando acesso da Prefeitura");
    expect(route).toContain("hasValidRefreshContinuity");
    expect(route).toContain("return <>{children}</>;");
    expect(route).toContain("return null;");
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

  it("validates tenant scope and storage quota before writing to R2", () => {
    const uploadApi = read("api/r2-upload.ts");
    expect(uploadApi).toContain('callDataApiRpc(req, "has_tenant_access"');
    expect(uploadApi).toContain('capability =');
    expect(uploadApi).toContain('"storage_bytes"');
    expect(uploadApi).toContain('assert_municipality_entitlement_v1');
    // Criar um cliente S3 não escreve no bucket. O bloqueio deve preceder
    // toda operação de gravação, tanto R2 quanto S3 municipal.
    const guard = uploadApi.indexOf('assert_municipality_entitlement_v1');
    const municipalWrite = uploadApi.indexOf('await municipalTarget.client.send(new PutObjectCommand');
    const r2Write = uploadApi.indexOf('await putR2ObjectWithFallback({');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(municipalWrite);
    expect(guard).toBeLessThan(r2Write);
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
