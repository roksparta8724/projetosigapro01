import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const platform = read("src/lib/platform.ts");
const main = read("src/main.tsx");
const indexCss = read("src/index.css");
const surfacePolarity = read("src/styles/surface-polarity.css");
const portal = read("src/components/platform/PortalFrame.tsx");
const baseCard = read("src/components/ui/card.tsx");
const tableCard = read("src/components/platform/TableCard.tsx");
const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
const protocol = read("src/pages/saas/ProtocolDeskPage.tsx");
const analyst = read("src/pages/saas/AnalystDeskPage.tsx");
const finance = read("src/pages/saas/FinanceDeskPage.tsx");
const financeProtocols = read("src/pages/saas/FinanceProtocolsPage.tsx");
const external = read("src/pages/saas/ExternalProcessControlPage.tsx");

describe("theme contrast authority", () => {
  it("loads the authoritative surface contract after index.css", () => {
    expect(main.indexOf('import "./index.css"')).toBeGreaterThanOrEqual(0);
    expect(main.indexOf('import "./styles/surface-polarity.css"')).toBeGreaterThan(
      main.indexOf('import "./index.css"'),
    );
    expect(surfacePolarity).toContain(
      "PROCESS THEME CONTRAST AUTHORITY V7 — ALL THEMES 2026-10-14",
    );
  });

  it("covers every configured dark preset with inverse-main semantics", () => {
    const expectedDarkPresets = [
      "escuro-institucional",
      "escuro-grafite",
      "escuro-oceano",
      "escuro-petroleo",
      "escuro-vinho",
      "escuro-floresta",
      "escuro-cacau",
    ];

    expectedDarkPresets.forEach((id) => {
      const start = platform.indexOf(`id: "${id}"`);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(platform.slice(start, start + 560)).toContain("inverseMain: true");
    });

    expect(portal).toContain('data-theme-family={inverseMainTheme ? "dark" : "light"}');
    expect(surfacePolarity).toContain('[data-theme-family="dark"]');
    expect(surfacePolarity).toContain('[data-theme-family="light"]');
  });

  it("keeps all process-list surfaces inside the same light/dark contract", () => {
    [protocol, analyst, finance, financeProtocols, external].forEach((source) => {
      expect(source).toContain('data-process-premium-card="true"');
    });

    expect(surfacePolarity).toContain('[data-process-premium-card="true"]');
    expect(surfacePolarity).toContain('background:linear-gradient(180deg,#11263d 0%,#091827 100%)');
    expect(surfacePolarity).toContain('color:#f8fafc !important');
    expect(surfacePolarity).toContain('background: linear-gradient(180deg,#ffffff 0%,#fbfdff 100%)');
    expect(surfacePolarity).toContain('color:#0f172a !important');
  });

  it("keeps the dark document command center bright in every theme", () => {
    expect(processDetail).toContain('id="sig-process-document-command-center"');
    expect(processDetail).toContain('data-premium-inverse-surface="true"');
    expect(surfacePolarity).toContain("#sig-process-document-command-center");
    expect(surfacePolarity).toContain("color:#ffffff !important");
    expect(surfacePolarity).toContain("color:#e0f2fe !important");
  });

  it("keeps primary process/document actions white on saturated buttons", () => {
    expect(external).toContain('data-primary-action="process"');
    expect(processDetail).toContain('data-primary-action="document"');
    expect(surfacePolarity).toContain('[data-primary-action="process"]');
    expect(surfacePolarity).toContain('[data-primary-action="document"]');
    expect(surfacePolarity).toContain("stroke:#ffffff !important");
  });

  it("does not recolor topbar or sidebar from the V7 process contract", () => {
    const v7Start = surfacePolarity.indexOf(
      "PROCESS THEME CONTRAST AUTHORITY V7 — ALL THEMES 2026-10-14",
    );
    expect(v7Start).toBeGreaterThanOrEqual(0);

    const v7 = surfacePolarity.slice(v7Start);
    expect(v7).not.toContain(".sig-premium-topbar");
    expect(v7).not.toContain(".sig-topbar-portal-host");
    expect(v7).not.toContain(".sig-sidebar-shell");
    expect(v7).toContain("Topbar/sidebar are deliberately not referenced in V7.");
  });

  it("keeps reusable adaptive cards governed by semantic surface polarity", () => {
    expect(baseCard).toContain('data-surface="adaptive-card"');
    expect(tableCard).toContain('data-surface="adaptive-card"');
    expect(surfacePolarity).toContain("SIGAPRO AUTHORITATIVE SURFACE POLARITY - 2026-10-14");
    expect(surfacePolarity).toContain('[data-surface-tone="light"]');
    expect(surfacePolarity).toContain('[data-surface-tone="dark"]');
  });

  it("leaves original theme variables and topbar color computation intact", () => {
    expect(indexCss).toContain("--sig-topbar:");
    expect(portal).toContain('const topbarFill = darken(primaryColor, -5);');
    expect(portal).toContain('"--sig-topbar": topbarFill');
  });
});
