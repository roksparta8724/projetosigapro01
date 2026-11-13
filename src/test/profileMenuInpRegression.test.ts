import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("SIGAPRO account-menu INP regression", () => {
  it("uses a non-modal profile dropdown without focus-trapping the full app on pointerdown", () => {
    const portal = read("src/components/platform/PortalFrame.tsx");
    const start = portal.indexOf('"sig-topbar-profile-cluster flex h-[');
    expect(start).toBeGreaterThan(0);
    expect(portal.slice(start - 500, start)).toContain("<DropdownMenu modal={false}>");
    expect(portal.slice(start, start + 1300)).toContain('aria-label="Abrir conta do usuário"');
    expect(portal).toContain("sig-topbar-account-dropdown");
    expect(portal).not.toContain("sig-topbar-account-dropdown w-[min(92vw,400px)] overflow-y-auto border p-3 shadow-[-18px_0_48px_rgba(15,23,42,0.20)] backdrop-blur-xl");
  });

  it("avoids expensive blur compositing while keeping the account menu styled", () => {
    const css = read("src/index.css");
    const rules = css.slice(css.lastIndexOf("/* Performance: the account menu"));
    expect(rules).toContain(".sig-topbar-account-dropdown");
    expect(rules).toContain("backdrop-filter: none !important");
    expect(rules).not.toContain("display: none");
    expect(rules).not.toContain("pointer-events: none");
  });

  it("does not inject a third-party performance toast into the released application", () => {
    const html = read("index.html");
    const main = read("src/main.tsx");
    const manifest = read("package.json");
    for (const body of [html, main, manifest]) {
      expect(body).not.toMatch(/react-scan|react-grab|scan\.global\.js|why-did-you-render/i);
    }
  });
});
