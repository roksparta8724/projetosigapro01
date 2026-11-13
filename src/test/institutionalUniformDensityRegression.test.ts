import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read = (p: string) => readFileSync(resolve(process.cwd(),p),"utf8");
describe("SIGAPRO — proporção institucional unificada", () => {
  it("usa por padrão a mesma identidade compacta em todas as páginas", () => {
    const frame=read("src/components/platform/PortalFrame.tsx");
    expect(frame).toContain("compactHeader = true");
    expect(frame).toContain('data-sigapro-compact-header={compactHeader ? "true" : "false"}');
    expect(frame).toContain('compactHeader && "mb-3 pb-3"');
    expect(frame).toContain('compactHeader && "!h-[66px] !w-[110px] lg:!h-[66px] lg:!w-[110px]"');
    expect(frame).toContain('compactHeader && "mt-1 text-xs leading-4"');
    expect(frame).toContain('!focusMode ? <header');
  });
  it("dashboard, prefeitura e organograma compartilham o mesmo PortalFrame", () => {
    for (const file of ["DashboardHomePage.tsx","TenantAdminPage.tsx","MunicipalOrganizationPage.tsx"]) {
      const code=read("src/pages/saas/"+file);
      expect(code).toContain("<PortalFrame ");
    }
  });
  it("não altera o PDF, a escala de impressão ou a identidade visual configurável", () => {
    const frame=read("src/components/platform/PortalFrame.tsx");
    const logo=read("src/components/platform/InstitutionalLogo.tsx");
    expect(frame).toContain('variant="header"');
    expect(frame).toContain("focusMode");
    expect(logo).toContain("MUNICIPAL_LOGO_BASE_RATIO");
    expect(logo).toContain("branding.logoScale");
  });
});