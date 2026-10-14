import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const saasDir = resolve(root, "src/pages/saas");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("layout integrity regression", () => {
  it("rejects top-level commas in arbitrary grid templates across SaaS pages", () => {
    const offenders: string[] = [];

    const hasTopLevelComma = (template: string) => {
      let depth = 0;
      for (const char of template) {
        if (char === "(") depth += 1;
        if (char === ")") depth = Math.max(0, depth - 1);
        if (char === "," && depth === 0) return true;
      }
      return false;
    };

    for (const file of readdirSync(saasDir)) {
      if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) continue;
      const source = readFileSync(resolve(saasDir, file), "utf8");
      const templates = Array.from(source.matchAll(/grid-cols-\[([^\]]+)\]/g), (match) => match[1]);
      if (templates.some(hasTopLevelComma)) offenders.push(file);
    }

    expect(offenders, `Invalid grid templates: ${offenders.join(", ")}`).toEqual([]);
  });

  it("expands single-content main grids instead of reserving a dead side column", () => {
    const pageLayout = read("src/components/platform/PageLayout.tsx");
    const css = read("src/index.css");
    const financeProtocols = read("src/pages/saas/FinanceProtocolsPage.tsx");
    const settings = read("src/pages/saas/ConfiguracoesPage.tsx");
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(pageLayout).toContain("[&>*:only-child]:col-span-full");
    expect(css).toContain(".sig-main-grid > :only-child");
    expect(css).toContain("grid-column: 1 / -1 !important");
    expect(financeProtocols).toContain('PageMainGrid className="grid-cols-1 xl:grid-cols-1"');
    expect(settings).toContain('PageMainGrid className="mt-4 grid-cols-1 xl:grid-cols-1"');
    expect(detail).toContain("showPrimaryDetailColumn");
    expect(detail).toContain("showSecondaryDetailColumn");
    expect(detail).toContain("useSplitDetailLayout");
    expect(detail).toContain("[grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]");
  });

  it("keeps the shared app shell single-column until the sidebar leaves enough width", () => {
    const pageLayout = read("src/components/platform/PageLayout.tsx");
    expect(pageLayout).toContain(
      "xl:grid-cols-[minmax(0,2.45fr)_minmax(280px,0.84fr)]",
    );
    expect(pageLayout).not.toContain(
      "lg:grid-cols-[minmax(0,2.35fr)_minmax(260px,0.82fr)]",
    );
  });

  it("keeps process detail cards readable at browser zoom without viewport-driven compression", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(detail).toContain(
      "[grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))]",
    );
    expect(detail).toContain(
      "[grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]",
    );
    expect(detail).toContain("content-start auto-rows-max");
    expect(detail).toContain('activeTab !== "resumo"');
    expect(detail).toContain(
      'const showPrimaryDetailColumn = ["imovel", "documentos", "historico"].includes(activeTab);',
    );
    expect(detail).toContain(
      'const showSecondaryDetailColumn = ["analise", "financeiro", "historico"].includes(activeTab);',
    );
    expect(detail).not.toContain(
      "min-[1560px]:grid-cols-[minmax(0,1.08fr)_minmax(480px,0.92fr)]",
    );
    expect(detail).not.toContain(
      "sm:grid-cols-[minmax(160px,200px)_minmax(0,1fr)]",
    );
    expect(detail).toContain("overflow-x-auto whitespace-nowrap");
    expect(detail).not.toContain('className="mt-2 break-all text-xs text-slate-500"');
  });

  it("keeps dark surfaces and disabled actions readable in every theme family", () => {
    const css = read("src/index.css");
    expect(css).toContain("SIGAPRO CONTRAST SAFETY NET 2026-10-11");
    expect(css).toContain('[class~="bg-slate-950"]');
    expect(css).toContain('[data-ui="button"]:disabled:is(');
    expect(css).toContain("color: #f8fafc !important");
  });

  it("keeps Master header and footer logos interactive like the profile image editor", () => {
    const settings = read("src/pages/saas/ConfiguracoesPage.tsx");
    expect(settings).toContain('label="Enquadramento do cabeçalho"');
    expect(settings).toContain('label="Enquadramento do rodapé"');
    expect(settings).toContain('onChange={updateMasterLogoFrame("header")}');
    expect(settings).toContain('onChange={updateMasterLogoFrame("footer")}');
    expect(settings).toContain("Clique e arraste o logo para posicionar");
    expect(settings).toContain("Resetar posição");
    expect(settings).toContain('viewportClassName="h-[300px] w-full max-w-[560px]"');
    expect(settings).toContain('wrapperClassName="sig-master-logo-editor"');
  });

  it("switches adaptive cards atomically between light and dark themes", () => {
    const css = read("src/index.css");
    const pageLayout = read("src/components/platform/PageLayout.tsx");
    const stat = read("src/components/platform/StatCard.tsx");
    const metric = read("src/components/platform/MetricCard.tsx");
    expect(css).toContain("SIGAPRO ATOMIC THEME SURFACES 2026-10-12");
    expect(css).toContain('[data-surface="adaptive-card"]');
    expect(css).toContain("transition-property: transform, box-shadow, border-color");
    expect(pageLayout).toContain('data-surface="adaptive-card"');
    expect(stat).toContain('data-surface="adaptive-card"');
    expect(metric).toContain('data-surface="adaptive-card"');
  });

  it("keeps a global neutral contrast contract for dark and light surfaces", () => {
    const css = read("src/index.css");
    expect(css).toContain("SIGAPRO GLOBAL SURFACE CONTRAST AUDIT 2026-10-12");
    expect(css).toContain(".bg-slate-950");
    expect(css).toContain(".bg-white");
    expect(css).toContain("color: #f8fafc !important");
    expect(css).toContain("color: #0f172a !important");
  });

  it("keeps hard contrast on dark buttons and cards regardless of theme inheritance", () => {
    const css = read("src/index.css");
    expect(css).toContain("SIGAPRO HARD CONTRAST GUARD 2026-10-12");
    expect(css).toContain(".sig-main-shell .sig-force-dark-action");
    expect(css).toContain('button[class~="bg-slate-950"]');
    expect(css).toContain("color: #ffffff !important");
  });

  it("keeps finance subpages free from forced narrow PIX and early fixed widths", () => {
    const protocols = read("src/pages/saas/FinanceProtocolsPage.tsx");
    const desk = read("src/pages/saas/FinanceDeskPage.tsx");

    expect(protocols).not.toContain("line-clamp-3 break-all");
    expect(protocols).toContain("overflow-x-auto whitespace-nowrap");
    expect(desk).not.toMatch(/\sxl:min-w-\[560px\]/);
    expect(desk).toContain("2xl:min-w-[560px]");
  });

  it("keeps refresh native and never traps user scrolling behind a frozen snapshot", () => {
    const main = read("src/main.tsx");
    const html = read("index.html");

    expect(main).toContain('window.history.scrollRestoration = "auto"');
    expect(main).not.toContain("window.scrollTo");
    expect(main).not.toContain("requestAnimationFrame(waitForStableFrame)");
    expect(main).not.toContain("persistVisualSnapshot");
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(html).not.toContain("data-sigapro-booting");
    expect(html).not.toContain("data-sigapro-internal");

    const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "";
    const normalizedBody = body.replace(/\s+/g, " ").trim();
    expect(normalizedBody).toBe(
      '<div id="root"></div> <script type="module" src="/src/main.tsx"></script>',
    );
  });

  it("never leaves localhost on a silent white screen during bootstrap", () => {
    const main = read("src/main.tsx");
    const app = read("src/App.tsx");

    expect(main).toContain('await import("./App.tsx")');
    expect(main).toContain("renderBootstrapFailure");
    expect(main).toContain("navigator.serviceWorker.getRegistrations()");
    expect(main).toContain("registration.unregister()");
    expect(main).toContain('name.startsWith("sigapro-enterprise-")');

    const boundaryIndex = app.indexOf("<AppErrorBoundary>");
    const bootstrapIndex = app.indexOf("<AppBootstrapProvider>");
    expect(boundaryIndex).toBeGreaterThanOrEqual(0);
    expect(bootstrapIndex).toBeGreaterThan(boundaryIndex);
  });

});
