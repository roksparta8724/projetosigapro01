import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const master=readFileSync("src/pages/saas/MasterAdminPage.tsx","utf8");
const license=readFileSync("src/components/platform/CloudflareVisionLicenseActivation.tsx","utf8");
const portal=readFileSync("src/components/platform/PortalFrame.tsx","utf8");
const logo=readFileSync("src/components/platform/InstitutionalLogo.tsx","utf8");
const css=readFileSync("src/styles/surface-polarity.css","utf8");
describe("SIGAPRO Master — licence discoverability and persistent visual identity",()=>{
  it("exposes direct navigation to master Cloudflare authorization",()=>{
    expect(master).toContain('data-master-vision-shortcut="true"');
    expect(master).toContain('navigate("/master?secao=visao-geral#ia-cloudflare")');
    expect(license).toContain('id="ia-cloudflare"');
    expect(license).toContain('disabled={!canSubmit}');
    expect(license).toContain("window.confirm(");
  });
  it("never ties the authenticated user's avatar key to municipality navigation",()=>{
    expect(portal).not.toContain('key={`${authenticatedProfileId || session.id}:${activeInstitutionId || "global"}`}');
    expect((portal.match(/key=\{authenticatedProfileId \|\| session.id\}/g)||[]).length).toBe(3);
    expect(portal).toContain('readCachedProfileAvatar(authenticatedProfileId || session.id');
    expect(portal).toContain('resolveProfileAvatarDisplayUrl(ownCachedAvatar)');
  });
  it("prevents master product logos from compressing below original scale, preserves contain",()=>{
    expect(logo).toContain('Math.max(1, Math.min(5, configuredScale))');
    expect(logo).toContain('object-contain object-center');
    expect(css).toContain('[data-logo-context="sigapro"][data-logo-variant="header"]');
    expect(css).toContain('aspect-ratio:1 / 1 !important');
    expect(css).toContain('object-fit:contain !important');
  });
});
