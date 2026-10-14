import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(resolve(root, "src/index.css"), "utf8");
const platform = readFileSync(resolve(root, "src/lib/platform.ts"), "utf8");
const button = readFileSync(resolve(root, "src/components/ui/button.tsx"), "utf8");
const analyst = readFileSync(resolve(root, "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
const surfacePolarity = readFileSync(resolve(root, "src/styles/surface-polarity.css"), "utf8");
const baseCard = readFileSync(resolve(root, "src/components/ui/card.tsx"), "utf8");
const tableCard = readFileSync(resolve(root, "src/components/platform/TableCard.tsx"), "utf8");
const organogram = readFileSync(resolve(root, "src/components/platform/MunicipalOrganogramBar.tsx"), "utf8");
const processDetail = readFileSync(resolve(root, "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

describe("theme contrast regressions", () => {
  it("covers every configured desktop theme through the two visual families", () => {
    const presetIds = Array.from(
      platform.matchAll(/id:\s*"(claro-[^"]+|escuro-[^"]+)"/g),
      (match) => match[1],
    );

    expect(presetIds.length).toBeGreaterThanOrEqual(11);
    expect(platform).toContain('inverseMain: false');
    expect(platform).toContain('inverseMain: true');
    expect(css).toContain('SIGAPRO SEMANTIC CONTRAST CONTRACT 2026-10-11');
    expect(css).toContain('[data-layout-mode="default"]');
    expect(css).toContain('[data-layout-mode="inverse-main"]');
  });

  it("gives buttons an explicit semantic contrast contract instead of relying on ancestor cards", () => {
    expect(button).toContain('data-button-variant={variant ?? "default"}');
    expect(css).toContain('[data-ui="button"][data-button-variant="default"]');
    expect(css).toContain('[data-ui="button"][data-button-variant="outline"]');
    expect(css).toContain('[data-ui="button"][data-button-variant="secondary"]');
    expect(css).toContain('color: #ffffff !important');
  });

  it("keeps the analyst primary process action readable on every theme", () => {
    expect(analyst).toContain(
      'className="sig-dark-action-btn inline-flex h-11 w-full items-center justify-center rounded-full bg-slate-950',
    );
    expect(css).toContain('.sig-main-shell .sig-dark-action-btn');
  });
});


describe("premium theme selector and process contrast", () => {
  it("keeps the theme selector readable in both visual families", () => {
    const portal = readFileSync(resolve(root, "src/components/platform/PortalFrame.tsx"), "utf8");

    expect(portal).toContain('data-theme-panel-mode={inverseMainTheme ? "dark" : "light"}');
    expect(portal).toContain('data-theme-option="true"');
    expect(portal).toContain('data-theme-option-active={activeThemeOption ? "true" : "false"}');
    expect(css).toContain('.sig-theme-panel[data-theme-panel-mode="dark"]');
    expect(css).toContain('.sig-theme-panel[data-theme-panel-mode="light"]');
    expect(css).toContain('[data-theme-option-active="true"]');
  });

  it("locks process and document primary actions to white copy/icons", () => {
    const external = readFileSync(resolve(root, "src/pages/saas/ExternalProcessControlPage.tsx"), "utf8");
    const detail = readFileSync(resolve(root, "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

    expect(external).toContain('data-primary-action="process"');
    expect(detail).toContain('data-primary-action="document"');
    expect(css).toContain('[data-primary-action="process"]');
    expect(css).toContain('[data-primary-action="document"]');
    expect(css).toContain('-webkit-text-fill-color: #ffffff !important');
  });

  it("keeps process cards and tabs legible after switching themes", () => {
    expect(css).toContain('[data-layout-mode="default"] .sig-main-shell [data-process-premium-card="true"]');
    expect(css).toContain('[data-layout-mode="inverse-main"] .sig-main-shell [data-process-premium-card="true"]');
    expect(css).toContain('[data-process-tabbar="true"] button[aria-pressed="false"]');
    expect(css).toContain('[data-process-tabbar="true"] button[aria-pressed="true"]');
  });
});


describe("authoritative surface-polarity contract", () => {
  it("makes all reusable cards adaptive without changing the topbar or sidebar", () => {
    expect(baseCard).toContain('data-surface="adaptive-card"');
    expect(tableCard).toContain('data-surface="adaptive-card"');
    expect(surfacePolarity).toContain("SIGAPRO AUTHORITATIVE SURFACE POLARITY - 2026-10-14");
    expect(surfacePolarity).toContain('[data-layout-mode="default"] .sig-main-shell [data-surface="adaptive-card"]');
    expect(surfacePolarity).toContain('[data-layout-mode="inverse-main"] .sig-main-shell [data-surface="adaptive-card"]');
    expect(surfacePolarity).toContain("Topbar/sidebar branding is intentionally untouched");
  });

  it("forces dark content surfaces and organogram chips to light foregrounds", () => {
    expect(processDetail).toContain('data-premium-inverse-surface="true"');
    expect(processDetail).toContain('data-surface-tone="dark"');
    expect(organogram).toContain('data-organogram-unit-chip="true"');
    expect(surfacePolarity).toContain('[data-municipal-organogram="true"] [data-organogram-unit-chip="true"]');
    expect(surfacePolarity).toContain("-webkit-text-fill-color: #ffffff !important");
  });

  it("forces light surfaces back to dark copy even when nested inside dark layouts", () => {
    expect(surfacePolarity).toContain('[data-surface-tone="light"]');
    expect(surfacePolarity).toContain("color: #0f172a !important");
    expect(surfacePolarity).toContain("color: #334155 !important");
  });
});


describe("final dark-surface contrast authority", () => {
  it("does not depend on sig-main-shell ancestry for explicit dark surfaces", () => {
    const surfacePolarity = readFileSync(resolve(root, "src/styles/surface-polarity.css"), "utf8");

    expect(surfacePolarity).toContain("FINAL CONTRAST AUTHORITY - PROCESS WORKSPACE");
    expect(surfacePolarity).toContain('html body #root #sig-process-document-command-center');
    expect(surfacePolarity).toContain('[data-organogram-unit-chip="true"]');
    expect(surfacePolarity).toContain('color: #ffffff !important');
    expect(surfacePolarity).toContain('-webkit-text-fill-color: #ffffff !important');
  });
});


describe("theme option card polarity", () => {
  it("keeps every theme option card readable by its own surface tone", () => {
    const portal = readFileSync(resolve(root, "src/components/platform/PortalFrame.tsx"), "utf8");

    expect(portal).toContain('data-theme-option-tone={preset.inverseMain ? "dark" : "light"}');
    expect(surfacePolarity).toContain("THEME OPTION CARD POLARITY LOCK - 2026-10-14");
    expect(surfacePolarity).toContain('[data-theme-option-tone="dark"]');
    expect(surfacePolarity).toContain('[data-theme-option-tone="light"]');
  });
});
