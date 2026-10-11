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
