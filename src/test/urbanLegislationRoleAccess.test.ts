import { describe, expect, it } from "vitest";
import type { UserRole } from "@/lib/platform";
import {
  canViewUrbanLegislationManagement,
  canEditUrbanLegislationManagement,
  URBAN_LEGISLATION_VIEW_ROLES,
} from "@/lib/urbanLegislationAccess";
import { readFileSync } from "node:fs";

const allRoles: UserRole[] = [
  "master_admin", "master_ops", "prefeitura_admin", "prefeitura_supervisor",
  "analista", "financeiro", "setor_intersetorial", "fiscal",
  "profissional_externo", "property_owner", "proprietario_consulta",
];

describe("SIGAPRO admin-only legal management", () => {
  it("shows the legal management workspace only to Master and Admin da Prefeitura", () => {
    const expected: UserRole[] = ["master_admin", "master_ops", "prefeitura_admin"];
    expect(URBAN_LEGISLATION_VIEW_ROLES).toEqual(expected);
    for (const role of allRoles) {
      expect(canViewUrbanLegislationManagement(role)).toBe(expected.includes(role));
    }
    expect(canViewUrbanLegislationManagement(null)).toBe(false);
  });
  it("Admin Prefeitura is strictly read-only; supervisor and employees cannot edit", () => {
    for (const role of allRoles) {
      expect(canEditUrbanLegislationManagement(role)).toBe(
        role === "master_admin" || role === "master_ops",
      );
    }
  });
  it("protects the route even if a user manually enters its URL or loads from F5", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const guard = readFileSync("src/components/platform/PermissionRoute.tsx", "utf8");
    const sidebar = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
    const registry = readFileSync("src/components/platform/UrbanLegislationRegistryPanel.tsx", "utf8");
    expect(app).toContain('allowedRoles={URBAN_LEGISLATION_VIEW_ROLES}');
    expect(app).toContain('path="/cadastro-gestao/legislacao"');
    expect(guard).toContain("(!allowedRoles || allowedRoles.includes(session.role))");
    expect(guard).toContain("hasValidRefreshContinuity() && !allowedRoles");
    expect(sidebar).toContain('key: "dashboard-master"');
    expect(sidebar).toContain('key: "settings"');
    expect(sidebar).not.toContain('{ to: "/legislacao/gestao",');
    expect(registry).toContain("canViewUrbanLegislationManagement(session.role)");
    expect(registry).toContain("canEditUrbanLegislationManagement(session.role)");
  });
});
