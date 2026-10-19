import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getInstitutionBranding, updateInstitutionBranding } from "../lib/institutionBranding";

describe("saved institutional logo zoom on header and footer", () => {
  it("retains independent header/footer zoom and offsets after saving", () => {
    const initial = {tenantId:"municipio", logoUrl:"/logo.png", logoScale:1, logoOffsetX:0, logoOffsetY:0} as Parameters<typeof updateInstitutionBranding>[0];
    const header = updateInstitutionBranding(initial,{logoScale:1.8,logoOffsetX:12,logoOffsetY:-5},"header");
    const both = updateInstitutionBranding(header,{logoScale:2.2,logoOffsetX:-7,logoOffsetY:9},"footer");
    expect(getInstitutionBranding(both,"Logo","header")).toMatchObject({logoScale:1.8,logoOffsetX:12,logoOffsetY:-5});
    expect(getInstitutionBranding(both,"Logo","footer")).toMatchObject({logoScale:2.2,logoOffsetX:-7,logoOffsetY:9});
  });
  it("never resets master header/footer crop to identity for preframed PNG", () => {
    const hook = readFileSync(resolve(process.cwd(),"src/hooks/useInstitutionBranding.ts"),"utf8");
    expect(hook).not.toContain('headerLogoFileName.endsWith("-enquadrado.png")');
    expect(hook).not.toContain('footerLogoFileName.endsWith("-enquadrado.png")');
    expect(hook).toContain('getMasterInstitutionBranding(masterBrandingState, "header")');
    expect(hook).toContain('getMasterInstitutionBranding(masterBrandingState, "footer")');
  });
});
