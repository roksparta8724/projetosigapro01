import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const load = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const dash = load("src/pages/saas/DashboardHomePage.tsx");
const frame = load("src/components/platform/PortalFrame.tsx");
const css = load("src/styles/dashboard-topbar-premium-v6.css");
const rootCss = load("src/index.css");
const main = load("src/main.tsx");

describe("Dashboard and fixed Topbar premium V6", () => {
  it("renders real information in the Dashboard header, never the empty action-only panel", () => {
    const hero = dash.split('data-dashboard-hero="compact-v6"')[1]?.split('section === "visao-geral"')[0] ?? "";
    expect(dash).not.toContain("<PageHero");
    expect(dash).toContain('<PortalFrame eyebrow="DASHBOARD" title="Resumo institucional" compactHeader>');
    expect(hero).toContain('data-dashboard-hero-title="true"');
    expect(hero).toContain("{headlineTitle}");
    expect(hero).toContain("{headlineDescription}");
    expect(hero).toContain("data-dashboard-hero-facts");
    expect(hero).toContain("masterMetrics.activeTenants");
    expect(hero).toContain("externalProcesses.length");
    expect(hero).toContain("inProgressCount");
    expect(hero).toContain("breachedCount");
    expect(hero).toContain("data-dashboard-hero-actions");
    expect(hero).toContain("{heroActions}");
  });
  it("keeps Dashboard as the only summary-first module", () => {
    expect(dash).toContain("summaryFirst");
    expect(dash).toContain('label: "Visão geral"');
    expect(dash).toContain('renderCurrentSection()');
  });
  it("synchronizes the topbar physical height with the content and sidebar offsets", () => {
    expect(frame).toContain('"--sig-topbar-height": "60px"');
    expect(frame).toContain('"--sig-topbar-height-mobile": "60px"');
    expect(frame).toContain("lg:min-h-[60px]");
    expect(rootCss).toContain("padding-top: var(--sig-topbar-height");
    expect(rootCss).toContain("padding-top: var(--sig-topbar-height-mobile");
    expect(css).toContain("min-height: var(--sig-topbar-height,60px)");
    expect(css).toContain("min-height: var(--sig-topbar-height-mobile,60px)");
    expect(load("src/styles/institutional-premium-v3.css")).toContain("top: var(--sig-topbar-height, 68px)");
  });
  it("keeps operational shortcuts, profile, theme and notifications available", () => {
    for(const label of ['aria-label="Processos"','aria-label="Organograma"','aria-label="Alternar menu lateral"','aria-label="Busca global"','aria-label="Abrir conta do usuário"']) {
      expect(frame).toContain(label);
    }
    expect(frame).toContain('navigate("/notificacoes")');
    expect(frame).toContain("sig-theme-anchor");
    expect(css).toContain("width: 42px !important");
    expect(css).toContain("min-width: 42px !important");
  });
  it("limits change to logged-in topbar and dashboard, never public login or PDF", () => {
    expect(css).toContain('.sig-app-frame[data-premium-design="institutional-v3"]');
    expect(css).not.toContain("canvas {");
    expect(css).not.toContain("iframe {");
    expect(css).not.toContain("a[href");
    expect(main.indexOf('import "./styles/dashboard-topbar-premium-v6.css";'))
      .toBeGreaterThan(main.indexOf('import "./styles/municipal-executive-v4.css";'));
  });
});
