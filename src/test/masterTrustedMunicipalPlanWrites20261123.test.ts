import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const impl = readFileSync("src/integrations/backend/platformImpl.ts", "utf8");
const data = readFileSync("src/hooks/usePlatformData.tsx", "utf8");

describe("SIGAPRO Master — gravação autenticada e auditável no Neon", () => {
  it("nunca depende de INSERT direto nas tabelas exclusivas do Master", () => {
    expect(impl).toContain('db.rpc("upsert_municipality_master", {');
    expect(impl).toContain('db.rpc("save_client_plan_assignment_master", {');
    expect(impl).toContain('db.rpc("upsert_plan_master", {');
    expect(impl).toContain('db.rpc("save_municipality_configuration", {');
    expect(impl).toContain('if (isNeonBackend) {');
    expect(impl).toContain('throw new Error(formatDatabaseError(error))');
  });

  it("preserva o ID do contrato confirmado pelo banco, não um ID gerado no navegador", () => {
    expect(impl).toContain('return { ...assignment, id: String(data.id) };');
    expect(data).toContain('nextAssignment = await saveRemoteClientPlanAssignment(nextAssignment);');
    expect(impl).toContain('String(data?.plan_id ?? "") !== assignment.planId');
  });

  it("respeita o escopo municipal e não remove configurações de outros departamentos", () => {
    expect(impl).toContain('_municipality_id: remoteTenantId');
    expect(impl).toContain('options?.skipMunicipalitySettings ? {} : settingsChanges');
    expect(impl).toContain('options?.skipMunicipalityBranding ? {} : brandingChanges');
    expect(impl).toContain('String(data?.municipality_id ?? "") !== remoteTenantId');
    expect(impl).toContain('normalizeMunicipalityStatus(input.status)');
  });
});
