import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/saas/MasterAdminPage.tsx"), "utf8");

describe("new municipality isolation", () => {
  it("keeps a new municipality draft isolated from an existing selected client", () => {
    expect(source).toContain("isCreatingNewInstitution");
    // The URL is the authoritative mode; creation never hydrates selected-tenant values.
    expect(source).toContain('resolveMasterFormMode(location.search) === "novo"');
    expect(source).toContain('if (isCreatingNewInstitution || workspaceView !== "cadastro") return;');
    expect(source).toContain('masterWorkspaceSearch(location.search, "cadastro", selectedTenantId, "novo")');
    expect(source).toContain("setForm({ ...emptyTenantForm })");
    expect(source).toContain('get("secao")');
    expect(source).not.toContain("setIsCreatingNewInstitution(");
    expect(source).not.toContain('setSelectedTenantId("")');
    expect(source).toContain("institutionId: isCreatingNewInstitution ? undefined");
  });

  it("does not reuse the previous municipality settings while creating a new client", () => {
    expect(source).toContain(
      "const currentSettings = !isCreatingNewInstitution && activeTenant ? getInstitutionSettings(activeTenant.id) : undefined;",
    );
  });
});
