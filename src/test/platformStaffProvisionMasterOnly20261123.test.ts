import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (p: string) => readFileSync(p, "utf8");
describe("platform owner-only staff provisioning", () => {
  it("offers employee accounts under the SIGAPRO platform scope only", () => {
    const registry = read("src/components/platform/MasterUserGovernance.tsx");
    const form = read("src/components/platform/PlatformStaffCreator.tsx");
    expect(registry).toContain("activeScope === PLATFORM_SCOPE");
    expect(registry).toContain("PlatformStaffCreator");
    expect(form).toContain('session.role !== "master_admin"');
    expect(form).toContain("Criar acesso SIGAPRO");
    expect(form).not.toContain("master_admin','active'");
  });
  it("keeps detached auth and server grants separate", () => {
    const backend = read("src/integrations/backend/platformImpl.ts");
    const sql = read("neon/migrations/20261123_provision_platform_staff_v1.sql");
    expect(backend).toContain('db.rpc("provision_platform_staff_account"');
    expect(backend).toContain('createDetachedNeonEmailAccount({');
    expect(backend).toContain('credentials: "omit"');
    expect(sql).toContain("p.role in ('admin_master','master_admin')");
    expect(sql).toContain("and p.municipality_id is null");
    expect(sql).toContain("'master_ops','active',null");
    expect(sql).toContain("promocao automatica proibida");
  });
});
