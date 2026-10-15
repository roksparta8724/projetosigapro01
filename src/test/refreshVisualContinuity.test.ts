import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("F5, logout and topbar visual continuity", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
  const auth = readFileSync(resolve(process.cwd(), "src/hooks/useAuthGateway.tsx"), "utf8");
  const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
  const bootstrap = readFileSync(resolve(process.cwd(), "src/hooks/useAppBootstrap.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

  it("never injects stale application HTML before React takes ownership of the root", () => {
    expect(html).not.toContain('root.setAttribute("data-sigapro-continuity", "true")');
    expect(html).not.toContain("root.innerHTML = snapshot.html");
    expect(html).toContain('holder.id = "sigapro-refresh-snapshot"');
    expect(html).not.toContain("sigapro-snapshot-page");
    expect(html).toContain('data-sigapro-initial-render');
    expect(main).toContain('const CONTINUITY_KEY = "sigapro.refresh.continuity.v1"');
    expect(main).toContain("persistRefreshContinuity");
    expect(main).toContain("buildRefreshVisualSnapshot(root)");
    expect(main).toContain('removeAttribute("data-sigapro-initial-render")');
    expect(main).toContain('window.addEventListener("sigapro-app-stable"');
    expect(main).not.toContain("waitForStableFrame");
    expect(main).not.toContain("window.scrollTo");
  });

  it("uses an isolated rendered viewport snapshot for hard reload continuity", () => {
    expect(html).toContain('holder.id = "sigapro-refresh-snapshot"');
    expect(html).toContain('image.src = "data:image/svg+xml;charset=utf-8,"');
    expect(html).toContain('holder.style.zoom = String(1 / snapshotZoom)');
    expect(main).toContain("buildRefreshVisualSnapshot(root)");
    expect(main).toContain("collectSnapshotCss()");
    expect(main).toContain('document.getElementById("sigapro-refresh-snapshot")');
  });

  it("keeps F5 inside the live React tree instead of performing a document reload", () => {
    expect(html).toContain('event.key === "F5"');
    expect(html).toContain('window.dispatchEvent(new CustomEvent("sigapro-soft-refresh"');
    expect(html).toContain("event.preventDefault()");
    expect(html).not.toContain("data-sigapro-document-preboot");
    expect(html).not.toContain("isDocumentWorkspace");
  });

  it("matches background and zoom before first paint", () => {
    expect(html).toContain('window.localStorage.getItem("sigapro.last-page-background.v1")');
    expect(html).toContain('window.localStorage.getItem("sigapro-layout-theme")');
    expect(html).toContain('document.documentElement.style.setProperty("--sig-initial-bg", initialBackground)');
    expect(html).toContain("document.documentElement.style.zoom = initialAppZoom");
  });

  it("loads critical process styles before the first React paint", () => {
    expect(html).toContain('href="/src/components/platform/ProcessIdentityPanel.css"');
    expect(html).toContain('href="/src/components/platform/AnalysisReadinessPanel.css"');
  });

  it("clears the local identity before navigation/network so account switching never shows the access validator", () => {
    const handleIndex = portal.indexOf('const handleSignOut = async');
    const handleBlock = portal.slice(handleIndex, handleIndex + 1000);
    expect(handleBlock).toContain("const signOutTask = signOut();");
    expect(handleBlock.indexOf("navigate(destination, { replace: true });")).toBeGreaterThan(
      handleBlock.indexOf("const signOutTask = signOut();"),
    );
    expect(handleBlock).toContain("await signOutTask;");
    expect(bootstrap).toContain("setAuthUserId(null);");
    expect(bootstrap).toContain("setAuthResolved(true);");
    expect(bootstrap).toContain("setLoading(false);");
    expect(bootstrap).toContain("manualSignInRef.current || explicitSignOutRef.current");
    expect(auth).not.toContain('window.location.replace("/acesso")');
    expect(portal).not.toContain("window.location.replace(destination)");
  });

  it("hard-anchors marker and theme panels below their own topbar buttons at 85 percent zoom", () => {
    expect(portal).toContain('sig-topbar-local-popper sig-marker-anchor relative');
    expect(portal).toContain('sig-topbar-local-popper sig-theme-anchor relative');
    expect(portal).toContain("portal={false}");
    expect(css).toContain("SIGAPRO TOPBAR LOCAL ANCHOR 2026-10-14");
    expect(css).toContain(".sig-topbar-local-popper [data-radix-popper-content-wrapper]");
    expect(css).toContain(".sig-topbar-local-popper .sig-marker-panel");
    expect(css).toContain(".sig-topbar-local-popper .sig-theme-panel");
    expect(css).toContain("left: 50% !important");
    expect(css).toContain("transform: translateX(-50%) !important");
  });
});
