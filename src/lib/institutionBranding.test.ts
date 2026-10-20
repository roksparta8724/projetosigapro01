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
  it("reaproveita logo genérico nos cabeçalhos e rodapés legados sem variante registrada", () => {
    const settings = { tenantId: "municipality-old", logoUrl: "r2:municipalities/test/branding/logo.png" } as TenantSettings;
    expect(getInstitutionBranding(settings, undefined, "header").logoUrl).toBe(settings.logoUrl);
    expect(getInstitutionBranding(settings, undefined, "footer").logoUrl).toBe(settings.logoUrl);
  });

  it("mantém rodapé disponível em cadastro com apenas o logo de cabeçalho", () => {
    const settings = {
      tenantId: "municipality-new",
      headerLogoUrl: "/municipality-new/logo-header.png",
    } as TenantSettings;
    expect(getInstitutionBranding(settings, undefined, "header").logoUrl).toBe("/municipality-new/logo-header.png");
    expect(getInstitutionBranding(settings, undefined, "footer").logoUrl).toBe("/municipality-new/logo-header.png");
  });

  it("não sobrescreve identidades de outros municípios", () => {
    const first = getInstitutionBranding({ tenantId: "municipality-a", logoUrl: "/a.png" } as TenantSettings);
    const second = getInstitutionBranding({ tenantId: "municipality-b", logoUrl: "/b.png" } as TenantSettings);
    expect(first.tenantId).toBe("municipality-a");
    expect(second.tenantId).toBe("municipality-b");
    expect(first.logoUrl).not.toBe(second.logoUrl);
  });

  it("não substitui um rodapé específico ao trocar somente o logo de cabeçalho", () => {
    const initial = {
      tenantId: "municipality-c",
      logoUrl: "/old.png",
      footerLogoUrl: "/footer.png",
    } as TenantSettings;
    const saved = updateInstitutionBranding(initial, { logoUrl: "/new.png" }, "header");
    expect(getInstitutionBranding(saved, undefined, "header").logoUrl).toBe("/new.png");
    expect(getInstitutionBranding(saved, undefined, "footer").logoUrl).toBe("/footer.png");
  });

});
