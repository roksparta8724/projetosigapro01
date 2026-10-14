import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  can,
  canAccessMunicipalArea,
  getRoleLandingPath,
  isProcessOwnedBySessionDepartment,
  processRecords,
  type SessionUser,
} from "@/lib/platform";

const admin: SessionUser = {
  id: "admin-readonly",
  name: "Administrador Prefeitura",
  role: "prefeitura_admin",
  accessLevel: 3,
  tenantId: "tenant-campo",
  municipalityId: "tenant-campo",
  title: "Administrador da Prefeitura",
  email: "admin@prefeitura.test",
  accountStatus: "active",
  userType: "Administrador",
  department: "Administracao Municipal",
};

describe("municipal admin operational boundary", () => {
  it("keeps municipal administration out of service workflow mutations", () => {
    expect(can(admin, "manage_tenant_users")).toBe(true);
    expect(can(admin, "manage_tenant_branding")).toBe(true);
    expect(can(admin, "manage_protocols")).toBe(false);
    expect(can(admin, "review_processes")).toBe(false);
    expect(can(admin, "dispatch_interdepartmental")).toBe(false);
    expect(can(admin, "manage_financial")).toBe(false);
    expect(can(admin, "manage_fiscal_financial")).toBe(false);
    expect(canAccessMunicipalArea(admin, "protocolos")).toBe(false);
    expect(canAccessMunicipalArea(admin, "analise")).toBe(false);
    expect(canAccessMunicipalArea(admin, "financeiro")).toBe(false);

    const sample = processRecords[0];
    if (sample) {
      expect(isProcessOwnedBySessionDepartment(admin, sample)).toBe(false);
    }
  });

  it("keeps a database guard versioned for the final deployment", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "neon/migrations/20261014_prefeitura_admin_readonly_operational_guard.sql"),
      "utf8",
    );
    expect(migration).toContain("guard_prefeitura_admin_operational_write_v1");
    expect(migration).toContain("'processes'");
    expect(migration).toContain("'payment_guides'");
    expect(migration).toContain("'interdepartmental_dispatches'");
  });
});

describe("professional process workspace", () => {
  it("lands the professional directly on the process list", () => {
    expect(getRoleLandingPath("profissional_externo")).toBe("/externo/controle");

    const tabs = readFileSync(resolve(process.cwd(), "src/lib/externalTabs.ts"), "utf8");
    expect(tabs).toContain('{ value: "controle", label: "Processos"');
    expect(tabs.indexOf('value: "controle"')).toBeLessThan(tabs.indexOf('value: "protocolar"'));
  });

  it("shows full cadastral data only to the linked professional and Urbanism analysis", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    expect(detail).toContain("processBelongsToExternalProfessional(session, process)");
    expect(detail).toContain("isUrbanAnalysisViewer");
    expect(detail).toContain("canViewFullIdentity={canViewCompleteCadastro}");
    expect(detail).toContain("Modo administrativo — consulta somente");
  });

  it("shows released finance information inside the professional process", () => {
    const detail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    expect(detail).toContain('session.role === "profissional_externo" ||');
    expect(detail).toContain("Financeiro do processo");
    expect(detail).toContain("somente as guias liberadas oficialmente");
    expect(detail).toContain('guide.status === "compensada" ? "Pago / compensado" : "Em aberto"');
  });
});
