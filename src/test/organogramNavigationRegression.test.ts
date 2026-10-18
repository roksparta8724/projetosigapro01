import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const portal = read("src/components/platform/PortalFrame.tsx");
const app = read("src/App.tsx");
const tenantAdmin = read("src/pages/saas/TenantAdminPage.tsx");
const page = read("src/pages/saas/MunicipalOrganizationPage.tsx");
const chart = read("src/components/platform/MunicipalOrganizationChart.tsx");

describe("municipal organogram navigation", () => {
  it("keeps Organograma explicitly visible in Prefeitura administration", () => {
    expect(portal).toContain('key: "municipal-organogram"');
    expect(portal).toContain('to: "/prefeitura/organograma"');
    expect(portal).toContain('label: "Organograma"');
    expect(portal).toContain('"/prefeitura/organograma"');
  });

  it("keeps the dedicated route and the administration tab", () => {
    expect(app).toContain('path="/prefeitura/organograma"');
    expect(app).toContain("<MunicipalOrganizationPage />");
    expect(tenantAdmin).toContain('{ value: "organograma", label: "Organograma"');
    expect(tenantAdmin).toContain('workspaceView === "organograma"');
  });

  it("keeps the official hierarchy editor and premium chart", () => {
    expect(page).toContain("Estrutura da Prefeitura");
    expect(page).toContain("Salvar estrutura");
    expect(page).toContain("<MunicipalOrganizationChart");
    expect(chart).toContain('data-premium-organogram="true"');
    expect(chart).toContain('data-organogram-node="true"');
    expect(chart).toContain('data-organogram-children="true"');
  });
});
