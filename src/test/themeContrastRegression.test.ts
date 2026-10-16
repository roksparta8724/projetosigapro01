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

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function presetBackground(id: string) {
  const start = platform.indexOf(`id: "${id}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const block = platform.slice(start, start + 620);
  const match = block.match(/background:\s*"(#[0-9a-fA-F]{6})"/);
  expect(match).not.toBeNull();
  return match?.[1] ?? "#000000";
}

describe("theme contrast authority", () => {
  it("loads the authoritative surface contract after index.css", () => {
    expect(main.indexOf('import "./index.css"')).toBeGreaterThanOrEqual(0);
    expect(main.indexOf('import "./styles/surface-polarity.css"')).toBeGreaterThan(
      main.indexOf('import "./index.css"'),
    );
    expect(surfacePolarity).toContain("Surface Polarity Contract V8");
    expect(surfacePolarity).toContain("PROCESS DETAIL VISIBILITY LOCK V14");
    expect(surfacePolarity).toContain("PROCESS DETAIL ADAPTIVE CARDS V15");
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
    expect(portal).toContain('data-layout-mode={inverseMainTheme ? "inverse-main" : "default"}');
    expect(surfacePolarity).toContain('[data-layout-mode="inverse-main"]');
    expect(surfacePolarity).toContain('[data-layout-mode="default"]');
  });

  it("meets strong contrast thresholds on every light and dark preset background", () => {
    const darkIds = [
      "escuro-institucional",
      "escuro-grafite",
      "escuro-oceano",
      "escuro-petroleo",
      "escuro-vinho",
      "escuro-floresta",
      "escuro-cacau",
    ];
    const lightIds = [
      "claro-institucional",
      "claro-neutro",
      "claro-civico",
      "claro-ardosia",
      "claro-vinho",
      "claro-rosa",
      "claro-verde",
      "claro-marrom",
    ];

    darkIds.forEach((id) => {
      const background = presetBackground(id);
      expect(contrastRatio("#f8fafc", background)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio("#cbd8e8", background)).toBeGreaterThanOrEqual(7);
    });

    lightIds.forEach((id) => {
      const background = presetBackground(id);
      expect(contrastRatio("#0f172a", background)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio("#526174", background)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("keeps all process-list surfaces inside the same light/dark contract", () => {
    [protocol, analyst, finance, financeProtocols, external].forEach((source) => {
      expect(source).toContain('data-process-premium-card="true"');
    });

    expect(surfacePolarity).toContain('[data-process-premium-card="true"]');
    expect(surfacePolarity).toContain("background: linear-gradient(180deg,#11283f 0%,#0a1928 100%)");
    expect(surfacePolarity).toContain("color: #f8fbff !important");
    expect(surfacePolarity).toContain("background: linear-gradient(180deg,#ffffff 0%,#f4f9ff 100%)");
    expect(surfacePolarity).toContain("color: #0b1726 !important");
  });

  it("keeps the dark document command center bright in every theme", () => {
    expect(processDetail).toContain('id="sig-process-document-command-center"');
    expect(processDetail).toContain('data-premium-inverse-surface="true"');
    expect(surfacePolarity).toContain("#sig-process-document-command-center");
    expect(surfacePolarity).toContain("color: #ffffff !important");
    expect(surfacePolarity).toContain("color: #e0f2fe !important");
  });

  it("keeps primary process/document actions white on saturated buttons", () => {
    expect(external).toContain('data-primary-action="process"');
    expect(processDetail).toContain('data-primary-action="document"');
    expect(surfacePolarity).toContain('[data-primary-action="process"]');
    expect(surfacePolarity).toContain('[data-primary-action="document"]');
    expect(surfacePolarity).toContain("stroke: #ffffff !important");
  });

  it("does not recolor topbar or sidebar from the final process contracts", () => {
    const finalAuthorityStart = surfacePolarity.indexOf("PROCESS DETAIL VISIBILITY LOCK V14");
    expect(finalAuthorityStart).toBeGreaterThanOrEqual(0);

    const finalContracts = surfacePolarity.slice(finalAuthorityStart);
    expect(finalContracts).not.toContain(".sig-premium-topbar");
    expect(finalContracts).not.toContain(".sig-topbar-portal-host");
    expect(finalContracts).not.toContain(".sig-sidebar-shell");
    expect(finalContracts).not.toContain(".sig-footer");
  });

  it("keeps reusable adaptive cards governed by semantic surface polarity", () => {
    expect(baseCard).toContain('data-surface="adaptive-card"');
    expect(tableCard).toContain('data-surface="adaptive-card"');
    expect(surfacePolarity).toContain("Surface Polarity Contract V8");
    expect(surfacePolarity).toContain('[data-surface="adaptive-card"]');
    expect(surfacePolarity).toContain('[data-surface="semantic-card"]');
  });

  it("leaves original theme variables and topbar color computation intact", () => {
    expect(indexCss).toContain("--sig-topbar:");
    expect(portal).toContain('const topbarFill = darken(primaryColor, -5);');
    expect(portal).toContain('"--sig-topbar": topbarFill');
  });
});
