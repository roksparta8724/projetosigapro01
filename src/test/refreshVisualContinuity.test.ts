import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("F5, logout and topbar visual continuity", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
  const auth = readFileSync(resolve(process.cwd(), "src/hooks/useAuthGateway.tsx"), "utf8");
  const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");

  it("reuses the real previous root during a full refresh without a separate shell overlay", () => {
    expect(html).toContain('var continuityKey = "sigapro.refresh.continuity.v1"');
    expect(html).toContain('root.setAttribute("data-sigapro-continuity", "true")');
    expect(html).not.toContain('<div id="sigapro-refresh-snapshot"');
    expect(html).not.toContain("sigapro-snapshot-page");
    expect(main).toContain('const CONTINUITY_KEY = "sigapro.refresh.continuity.v1"');
    expect(main).toContain("persistRefreshContinuity");
    expect(main).not.toContain("waitForStableFrame");
    expect(main).not.toContain("window.scrollTo");
  });

  it("matches background and zoom before first paint", () => {
    expect(html).toContain('window.localStorage.getItem("sigapro.last-page-background.v1")');
    expect(html).toContain('window.localStorage.getItem("sigapro-layout-theme")');
    expect(html).toContain('document.documentElement.style.setProperty("--sig-initial-bg", initialBackground)');
    expect(html).toContain("document.documentElement.style.zoom = initialAppZoom");
  });

  it("logs out by routing first and never reloads the document", () => {
    const handleIndex = portal.indexOf('const handleSignOut = async');
    const handleBlock = portal.slice(handleIndex, handleIndex + 900);
    expect(handleBlock.indexOf("navigate(destination, { replace: true });")).toBeGreaterThanOrEqual(0);
    expect(handleBlock.indexOf("await signOut();")).toBeGreaterThan(
      handleBlock.indexOf("navigate(destination, { replace: true });"),
    );
    expect(auth).not.toContain('window.location.replace("/acesso")');
    expect(portal).not.toContain("window.location.replace(destination)");
  });

  it("keeps marker and theme poppers in the same zoom coordinate system as topbar triggers", () => {
    const markerTrigger = portal.indexOf('aria-label="Marcadores"');
    const markerPanel = portal.indexOf('className="sig-marker-panel', markerTrigger);
    const markerBlock = portal.slice(markerTrigger, markerPanel + 500);
    expect(markerBlock).toContain("portal={false}");
    expect(markerBlock).toContain('align="center"');

    const themeTrigger = portal.indexOf('aria-label="Selecionar tema"');
    const themePanel = portal.indexOf('className="sig-theme-panel', themeTrigger);
    const themeBlock = portal.slice(themeTrigger, themePanel + 500);
    expect(themeBlock).toContain("portal={false}");
    expect(themeBlock).toContain('align="center"');
  });
});
