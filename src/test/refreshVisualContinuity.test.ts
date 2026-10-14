import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("F5 visual continuity", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
  const auth = readFileSync(resolve(process.cwd(), "src/hooks/useAuthGateway.tsx"), "utf8");
  const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");

  it("never ships the legacy frozen boot shell", () => {
    expect(html).not.toContain('<div id="sigapro-refresh-snapshot"');
    expect(html).not.toContain("snapshot.html");
    expect(html).not.toContain('data-sigapro-booting="true"');
    expect(main).not.toContain("persistVisualSnapshot");
    expect(main).not.toContain("waitForStableFrame");
    expect(main).not.toContain("window.scrollTo");
  });

  it("matches background and zoom before the first paint", () => {
    expect(html).toContain('window.localStorage.getItem("sigapro.last-page-background.v1")');
    expect(html).toContain('window.localStorage.getItem("sigapro-layout-theme")');
    expect(html).toContain('document.documentElement.style.setProperty("--sig-initial-bg", initialBackground)');
    expect(html).toContain("document.documentElement.style.zoom = initialAppZoom");
    expect(html).toContain("data-page-zoom");
    expect(portal).toContain('window.localStorage.setItem("sigapro.last-page-background.v1", pageBackground)');
  });

  it("mounts React before localhost cache maintenance", () => {
    const renderIndex = main.indexOf("createRoot(rootElement).render(<App />)");
    const maintenanceIndex = main.indexOf("scheduleLocalCacheMaintenance();");

    expect(renderIndex).toBeGreaterThanOrEqual(0);
    expect(maintenanceIndex).toBeGreaterThan(renderIndex);
    expect(main).not.toContain("await clearLocalDevelopmentCaches()");
  });

  it("logs out without hard-reloading the document", () => {
    expect(auth).not.toContain('window.location.replace("/acesso")');
    expect(portal).not.toContain("window.location.replace(destination)");
    expect(portal).toContain("navigate(destination, { replace: true });");
  });

  it("anchors Marcadores directly below its topbar icon", () => {
    const trigger = portal.indexOf('aria-label="Marcadores"');
    const panel = portal.indexOf('className="sig-marker-panel', trigger);
    expect(trigger).toBeGreaterThanOrEqual(0);
    expect(panel).toBeGreaterThan(trigger);

    const block = portal.slice(trigger, panel + 500);
    expect(block).toContain('side="bottom"');
    expect(block).toContain('align="center"');
    expect(block).toContain("sideOffset={12}");
    expect(block).toContain("collisionPadding={16}");
  });
});
