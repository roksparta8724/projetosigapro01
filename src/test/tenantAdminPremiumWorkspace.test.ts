import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("tenant admin premium workspace", () => {
  const admin = read("src/pages/saas/TenantAdminPage.tsx");
  const organogram = read("src/components/platform/MunicipalOrganizationChart.tsx");
  const surfacePolarity = read("src/styles/surface-polarity.css");

  it("renders municipal processes as compact queue rows", () => {
    expect(admin).toContain("Abrir processo");
    expect(admin).toContain("Etapa atual");
    expect(admin).toContain("Pendências");
    expect(admin).toContain("lg:grid-cols-[minmax(260px,1.55fr)");
    expect(admin).toContain("navigate(\`/processos/\${process.id}\`)");
  });

  it("uses a distinct institutional identity layout for users", () => {
    expect(admin).toContain("Lotação institucional");
    expect(admin).toContain("Acesso e segurança");
    expect(admin).toContain("roleVisual");
    expect(admin).toContain("Editar cadastro");
    expect(admin).toContain("Bloquear acesso");
  });

  it("keeps user cards premium and readable in inverse dark themes", () => {
    expect(admin).toContain('data-municipal-user-card="true"');
    expect(admin).toContain('data-municipal-user-header="true"');
    expect(admin).toContain('data-municipal-user-security="true"');
    expect(admin).toContain('data-municipal-user-actions="true"');
    expect(surfacePolarity).toContain("PREMIUM DARK LOCK V17");
    expect(surfacePolarity).toContain('[data-municipal-user-card="true"]');
    expect(surfacePolarity).toContain("background:linear-gradient(135deg,#152b44");
    expect(surfacePolarity).toContain("-webkit-font-smoothing:antialiased");
  });

  it("uses institutional hierarchy abbreviations in the organogram", () => {
    expect(organogram).toContain('short: "SEC"');
    expect(organogram).toContain('short: "DIR"');
    expect(organogram).toContain('short: "DEP"');
    expect(organogram).toContain('short: "COORD"');
    expect(organogram).toContain('short: "SET"');
    expect(organogram).toContain("getInstitutionalUnitIdentity");
    expect(organogram).toContain("Hierarquia institucional por siglas");
    expect(organogram).toContain('data-municipal-organogram="true"');
    expect(organogram).toContain('data-organogram-node="true"');
    expect(organogram).toContain("data-unit-type=");
    expect(surfacePolarity).toContain('[data-municipal-organogram="true"]');
    expect(surfacePolarity).toContain('[data-organogram-edit="true"]');
  });
});
