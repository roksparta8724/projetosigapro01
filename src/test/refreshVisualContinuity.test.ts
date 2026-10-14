import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("F5 visual continuity", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");

  it("does not ship the legacy blue boot shell anymore", () => {
    expect(html).not.toContain("sigapro-boot-shell");
    expect(html).not.toContain("sig-boot-topbar");
    expect(html).not.toContain("sig-boot-sidebar");
  });

  it("applies internal zoom before first paint without freezing a cloned page", () => {
    expect(html).toContain("document.documentElement.style.zoom = initialAppZoom");
    expect(html).toContain("data-page-zoom");
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(html).not.toContain("data-sigapro-booting");
    expect(main).toContain('window.history.scrollRestoration = "auto"');
    expect(main).not.toContain("persistVisualSnapshot");
    expect(main).not.toContain("restoreFrozenSnapshot");
    expect(main).not.toContain("window.scrollTo");
  });
});
