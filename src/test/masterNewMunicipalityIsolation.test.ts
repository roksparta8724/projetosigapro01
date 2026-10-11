import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/saas/MasterAdminPage.tsx"), "utf8");

describe("new municipality isolation", () => {
  it("keeps a new municipality draft isolated from an existing selected client", () => {
    expect(source).toContain("isCreatingNewInstitution");
    expect(source).toContain("if (isCreatingNewInstitution) return;");
    expect(source).toContain("setIsCreatingNewInstitution(true)");
    expect(source).toContain("setSelectedTenantId(\"\")");
    expect(source).toContain("setForm(emptyTenantForm)");
    expect(source).toContain("institutionId: isCreatingNewInstitution ? undefined");
  });

  it("does not reuse the previous municipality settings while creating a new client", () => {
    expect(source).toContain(
      "const currentSettings = !isCreatingNewInstitution && activeTenant ? getInstitutionSettings(activeTenant.id) : undefined;",
    );
  });
});
