import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const css = readFileSync(resolve(root, "src/index.css"), "utf8");
const platform = readFileSync(resolve(root, "src/lib/platform.ts"), "utf8");
const button = readFileSync(resolve(root, "src/components/ui/button.tsx"), "utf8");
const analyst = readFileSync(resolve(root, "src/pages/saas/AnalystDeskPage.tsx"), "utf8");

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
