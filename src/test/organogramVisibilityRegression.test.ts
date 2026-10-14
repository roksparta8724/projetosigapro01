import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal organogram visibility", () => {
  it("keeps the official organogram visible on every municipal department page", () => {
    const portal = read("src/components/platform/PortalFrame.tsx");
    const bar = read("src/components/platform/MunicipalOrganogramBar.tsx");

    expect(portal).toContain("<MunicipalOrganogramBar");
    expect(portal).toContain('title="Organograma do departamento"');
    expect(portal).toContain("departmentOrganogramHint");
    expect(bar).toContain('data-municipal-organogram="true"');
    expect(bar).toContain("Ver organograma completo");
  });

  it("keeps the process current unit tied to the same official hierarchy", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(detail).toContain('title="Organograma do processo"');
    expect(detail).toContain("departmentHint={currentFolder}");
    expect(detail).toContain("getPath: getOrganizationPath");
    expect(detail).toContain("Organograma para despacho");
    expect(detail).toContain("setDispatchTo(department.id)");
  });

  it("caches the last official organogram so F5 never blanks the hierarchy", () => {
    const hook = read("src/hooks/useMunicipalOrganogram.ts");

    expect(hook).toContain('const CACHE_PREFIX = "sigapro:municipal-organogram:v1"');
    expect(hook).toContain("window.sessionStorage.getItem");
    expect(hook).toContain("window.sessionStorage.setItem");
    expect(hook).toContain("listRemoteMunicipalDepartments");
  });

  it("shows codes and complete hierarchy for dispatch destinations", () => {
    const hook = read("src/hooks/useMunicipalOrganogram.ts");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(hook).toContain('join(" › ")');
    expect(detail).toContain("department.code.trim()");
    expect(detail).toContain("getOrganizationPath(department.name)");
  });
});
