import { describe, expect, it } from "vitest";
import { getInstitutionBranding, updateInstitutionBranding } from "@/lib/institutionBranding";
import type { TenantSettings } from "@/lib/platform";

describe("municipal branding variants", () => {
  it("keeps header and footer independent when only the footer is removed", () => {
    const settings = {
      tenantId: "municipality-a",
      logoUrl: "/header.png",
      headerLogoUrl: "/header.png",
      footerLogoUrl: "/footer.png",
    } as TenantSettings;

    const updated = updateInstitutionBranding(settings, { logoUrl: "" }, "footer");
    expect(getInstitutionBranding(updated, undefined, "header").logoUrl).toBe("/header.png");
    expect(getInstitutionBranding(updated, undefined, "footer").logoUrl).toBe("");
  });

  it("does not use the coat of arms as the missing municipal logo", () => {
    const settings = { tenantId: "municipality-a", logoUrl: "", brasaoUrl: "/coat.png" } as TenantSettings;
    expect(getInstitutionBranding(settings).logoUrl).toBe("");
  });
});
