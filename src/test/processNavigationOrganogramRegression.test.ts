import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const analyst = readFileSync(resolve(root, "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
const processDetail = readFileSync(resolve(root, "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
const portal = readFileSync(resolve(root, "src/components/platform/PortalFrame.tsx"), "utf8");
const permission = readFileSync(resolve(root, "src/components/platform/PermissionRoute.tsx"), "utf8");

describe("process entry and organogram regression", () => {
  it("restores premium analysis cards while keeping both direct process links", () => {
    expect(analyst).not.toContain('import { CompactProcessRegistry }');
    expect(analyst).toContain("renderQueue(");
    expect(analyst).toContain('data-primary-action="process"');
    expect(analyst).toContain("sm:w-[190px]");
    expect(analyst).toContain("formatOfficialProcessNumber(process.protocol)");
  });

  it("removes the full-organogram link only from the process page", () => {
    expect(processDetail).toContain("showLink={false}");
  });

  it("keeps the topbar organogram shortcut compact and makes consultation reachable", () => {
    expect(portal).toContain('"sig-topbar-organogram-button relative"');
    expect(portal).not.toContain('"sig-topbar-organogram-button relative !w-auto gap-2 px-2.5"');
    expect(permission).not.toContain('location.pathname.startsWith("/prefeitura/organograma") ||');
  });

  it("routes the Processos shortcut back to the operational analysis queue when applicable", () => {
    expect(portal).toContain('canAccessMunicipalArea(session, "analise")');
    expect(portal).toContain('"/prefeitura/analise?secao=fila"');
    expect(analyst).toContain('searchParams.get("secao") === "fila"');
  });
});
