import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal organogram visibility", () => {
  it("keeps the official organogram reachable on every municipal page without duplicating the full strip", () => {
    const portal = read("src/components/platform/PortalFrame.tsx");
    const bar = read("src/components/platform/MunicipalOrganogramBar.tsx");

    expect(portal).toContain("showMunicipalOrganogramShortcut");
    expect(portal).toContain('navigate("/prefeitura/organograma")');
    expect(portal).toContain('aria-label="Organograma municipal"');
    expect(portal).toContain('title="Organograma municipal"');
    expect(portal).not.toContain("<MunicipalOrganogramBar");
    expect(portal).not.toContain("departmentOrganogramHint");
    expect(bar).toContain('data-municipal-organogram="true"');
    expect(bar).toContain("sig-organogram-card");
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

    expect(hook).toContain('const CACHE_PREFIX = "sigapro:municipal-organogram:v2"');
    expect(hook).toContain("window.localStorage.getItem");
    expect(hook).toContain("window.localStorage.setItem");
    expect(hook).toContain("listRemoteMunicipalDepartments");
    expect(hook).toContain("listRemoteInternalMunicipalDepartments");
  });

  it("shows codes and complete hierarchy for dispatch destinations", () => {
    const hook = read("src/hooks/useMunicipalOrganogram.ts");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(hook).toContain('join(" › ")');
    expect(detail).toContain("department.code?.trim()");
    expect(detail).toContain("getOrganizationPath(department.name)");
  });
});


describe("organogram permissions and administration", () => {
  it("uses the process-aware public RPC for project-wide visibility", () => {
    const backend = readFileSync(
      resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"),
      "utf8",
    );
    expect(backend).toContain('db.rpc("list_public_municipal_departments_v1"');
    expect(backend).toContain('db.rpc("list_internal_municipal_departments_v1"');
    expect(backend).not.toContain('db.rpc("list_municipal_departments_v1"');
  });

  it("lets the municipal administrator redesign the hierarchy while dev stays local-only", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/pages/saas/MunicipalOrganizationPage.tsx"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(process.cwd(), "src/hooks/useMunicipalOrganogram.ts"),
      "utf8",
    );

    expect(page).toContain('session.role === "prefeitura_admin"');
    expect(page).toContain("Nova unidade");
    expect(page).toContain("Unidade superior");
    expect(page).toContain("Salvar estrutura");
    expect(page).toContain("upsertRemoteMunicipalDepartment");
    expect(hook).toContain("const LOCAL_VALIDATION = import.meta.env.DEV");
    expect(hook).toContain("saveLocalDepartments");
    expect(hook).toContain("localValidation: LOCAL_VALIDATION");
  });

  it("keeps a hierarchy visible even if an old restricted read path fails", () => {
    const bar = readFileSync(
      resolve(process.cwd(), "src/components/platform/MunicipalOrganogramBar.tsx"),
      "utf8",
    );
    expect(bar).toContain("fallbackHierarchy");
    expect(bar).toContain('code: "URB"');
    expect(bar).toContain('code: "ANU"');
    expect(bar).not.toContain("Sem permissão para visualizar o organograma desta Prefeitura.");
  });
});


describe("organogram visual contrast", () => {
  it("keeps dark organogram code chips readable in every theme", () => {
    const bar = readFileSync(
      resolve(process.cwd(), "src/components/platform/MunicipalOrganogramBar.tsx"),
      "utf8",
    );
    const polarity = readFileSync(
      resolve(process.cwd(), "src/styles/surface-polarity.css"),
      "utf8",
    );

    expect(bar).toContain('data-organogram-code="true"');
    expect(bar).toContain('data-contrast-surface="dark"');
    expect(bar).toContain("sig-dark-chip");
    expect(polarity).toContain("Surface Polarity Contract V8");
    expect(polarity).toContain('[data-municipal-organogram="true"] [data-organogram-code="true"]');
    expect(polarity).toContain("-webkit-text-fill-color: #ffffff !important");
  });
});


describe("organogram surface polarity", () => {
  it("loads the last-authority contrast stylesheet after legacy styles", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
    const indexImport = main.indexOf('import "./index.css"');
    const polarityImport = main.indexOf('import "./styles/surface-polarity.css"');

    expect(indexImport).toBeGreaterThanOrEqual(0);
    expect(polarityImport).toBeGreaterThan(indexImport);
  });

  it("treats every dark organogram unit pill as white-on-dark", () => {
    const bar = readFileSync(
      resolve(process.cwd(), "src/components/platform/MunicipalOrganogramBar.tsx"),
      "utf8",
    );
    const css = readFileSync(
      resolve(process.cwd(), "src/styles/surface-polarity.css"),
      "utf8",
    );

    expect(bar).toContain('data-organogram-unit-chip="true"');
    expect(bar).toContain('data-contrast-surface="dark"');
    expect(css).toContain('[data-organogram-unit-chip="true"] *');
    expect(css).toContain("-webkit-text-fill-color: #ffffff !important");
  });
});


describe("dispatch organogram destination cards", () => {
  it("keeps every destination readable without duplicated code/path clutter", () => {
    const detail = readFileSync(
      resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"),
      "utf8",
    );

    expect(detail).toContain("getPathRecords: getOrganizationPathRecords");
    expect(detail).toContain("hierarchyLabel");
    expect(detail).toContain("Destino selecionado");
    expect(detail).toContain("h-8 min-w-[44px]");
    expect(detail).toContain("lg:grid-cols-2 2xl:grid-cols-3");
    expect(detail).not.toContain('max-w-[310px] truncate">{getOrganizationPath(department.name)}');
  });
});
