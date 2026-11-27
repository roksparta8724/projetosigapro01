import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const analyst = readFileSync(resolve(root, "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
const processDetail = readFileSync(resolve(root, "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
const portal = readFileSync(resolve(root, "src/components/platform/PortalFrame.tsx"), "utf8");
const permission = readFileSync(resolve(root, "src/components/platform/PermissionRoute.tsx"), "utf8");
const css = readFileSync(resolve(root, "src/index.css"), "utf8");

describe("process entry and organogram regression", () => {
  it("makes compact process-control the default while preserving detailed analysis actions", () => {
    expect(analyst).toContain('import { PremiumProcessRegistry as CompactProcessRegistry } from "@/components/platform/PremiumProcessRegistry";');
    expect(analyst).toContain('processListView === "tabela"');
    expect(analyst).toContain("Ver ações detalhadas da Análise");
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

  it("routes the topbar Processos shortcut into the municipal registry, preserving separate analysis deep links", () => {
    const destination = readFileSync(resolve(root, "src/lib/topbarProcessDestination.ts"), "utf8");
    expect(portal).toContain("resolveTopbarProcessDestination(session.role)");
    expect(portal).toContain('data-topbar-process-shortcut="mobile"');
    expect(portal).toContain('data-topbar-process-shortcut="desktop"');
    expect(destination).toContain('return "/prefeitura/processos";');
    expect(destination).toContain('return "/dashboard/processos";');
    expect(analyst).toContain('const requestedSection = searchParams.get("secao");');
    expect(analyst).toContain('    : "fila";');
    expect(analyst).toContain('params.set("secao", next)');
    expect(analyst).toContain('persistInUrl={false}');
  });

  it("keeps the dispatch organogram hierarchical, grouped and selectable without flattening the Prefeitura structure", () => {
    expect(processDetail).toContain('data-dispatch-organogram-hierarchy="true"');
    expect(processDetail).toContain('data-organogram-branch="true"');
    expect(processDetail).toContain("candidate.parentDepartmentId === parentId");
    expect(processDetail).toContain("collectChildren(child.id, depth + 1)");
    expect(processDetail).toContain('data-organogram-depth={depth}');
    expect(processDetail).toContain('data-current-organogram-unit=');
    expect(processDetail).toContain("Origem atual");
    expect(processDetail).toContain("Estrutura institucional");
    expect(processDetail).toContain("unidades oficiais");
  });

  it("keeps the selected destination white-on-blue and auto-fills the real local dispatch date", () => {
    expect(processDetail).toContain("data-selected-organogram-card={");
    expect(processDetail).toContain('selected ? "true" : "false"');
    expect(processDetail).toContain('data-organogram-destination-title="true"');
    expect(processDetail).toContain('data-organogram-destination-path="true"');
    expect(processDetail).toContain("function currentLocalDateValue");
    expect(processDetail).toContain("now.getFullYear()");
    expect(processDetail).toContain("now.getMonth() + 1");
    expect(processDetail).toContain("now.getDate()");
    expect(processDetail.indexOf("function currentLocalDateValue")).toBeLessThan(
      processDetail.indexOf("export function ProcessDetailPage"),
    );
    expect(processDetail).toContain('useState(() => currentLocalDateValue())');
    expect(processDetail).toContain('aria-label="Data do encaminhamento"');
    expect(processDetail).toContain("setDispatchDueDate(currentLocalDateValue())");
    expect(css).toContain("DISPATCH ORGANOGRAM SELECTED CARD V11");
    expect(css).toContain('data-selected-organogram-card="true"');
    expect(css).toContain("color:#ffffff !important");
  });

});
