import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("regressões visuais e financeiras do SIGAPRO", () => {
  const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
  const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

  it("remove o atalho Ctrl K visível da busca", () => {
    expect(portal).not.toContain("Ctrl K");
  });

  it("mostra somente o nome da diretoria no banner", () => {
    const bannerStart = portal.indexOf('Diretoria responsável');
    const bannerEnd = portal.indexOf('</header>', bannerStart);
    const banner = portal.slice(bannerStart, bannerEnd);
    expect(banner).toContain("tenantSettings.diretoriaResponsavel");
    expect(banner).not.toContain("tenantSettings.diretoriaTelefone");
    expect(banner).not.toContain("tenantSettings.diretoriaEmail");
  });

  it("inverte o contraste da busca entre tema claro e escuro", () => {
    expect(portal).toContain('data-theme-family={inverseMainTheme ? "dark" : "light"}');
    expect(css).toContain('[data-theme-family="light"]');
    expect(css).toContain("background: linear-gradient(180deg, #111827 0%, #020617 100%)");
    expect(css).toContain('[data-theme-family="dark"]');
    expect(css).toContain("background: linear-gradient(180deg, #ffffff 0%, #eef2f7 100%)");
  });

  it("preserva a geometria exata do viewport no snapshot do F5", () => {
    expect(main).toContain("viewportWidth: window.innerWidth");
    expect(main).toContain("viewportHeight: window.innerHeight");
    expect(main).toContain("cssText: collectLoadedCssText()");
    expect(html).toContain("snapshot.cssText");
    expect(html).toContain("sigapro-refresh-snapshot-css");
    expect(html).toContain("--sig-snapshot-viewport-width");
    expect(html).toContain("--sig-snapshot-viewport-height");
    expect(html).toContain("transform: none");
  });

  it("permite que a unidade de Protocolo confirme recebimento da guia inicial", () => {
    expect(processDetail).toContain('protocolUnitIdentity.includes("protocolo")');
    expect(processDetail).toContain('markGuideAsPaid(process.id, session.name, "protocolo")');
    expect(processDetail).toContain("Confirmar pagamento recebido");
    expect(processDetail).toContain('process.status === "pagamento_pendente"');
  });
});
