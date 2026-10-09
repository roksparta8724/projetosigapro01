import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("regressões visuais e financeiras do SIGAPRO", () => {
  const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");

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

  it("mantém a busca integrada ao tema sem superfície branca", () => {
    expect(css).toContain("Final topbar search treatment");
    expect(css).toContain("rgba(15, 23, 42, 0.22)");
    expect(css).toContain(".sig-topbar-search-icon");
  });

  it("preserva a geometria exata do viewport no snapshot do F5", () => {
    expect(main).toContain("viewportWidth: window.innerWidth");
    expect(main).toContain("viewportHeight: window.innerHeight");
    expect(html).toContain("--sig-snapshot-viewport-width");
    expect(html).toContain("--sig-snapshot-viewport-height");
    expect(html).toContain("transform: none");
  });
});
