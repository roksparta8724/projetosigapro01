import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("F5, logout and topbar visual continuity", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
  const auth = readFileSync(resolve(process.cwd(), "src/hooks/useAuthGateway.tsx"), "utf8");
  const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
  const bootstrap = readFileSync(resolve(process.cwd(), "src/hooks/useAppBootstrap.tsx"), "utf8");
  const platformData = readFileSync(resolve(process.cwd(), "src/hooks/usePlatformData.tsx"), "utf8");
  const planEntitlements = readFileSync(resolve(process.cwd(), "src/hooks/usePlanEntitlements.ts"), "utf8");
  const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
  const urbanChecklist = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
  const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

  it("has no refresh shell, DOM clone, preboot screen or frozen snapshot", () => {
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(html).not.toContain("snapshot.html");
    expect(html).not.toContain("snapshot.svg");
    expect(html).not.toContain("sigapro-snapshot-page");
    expect(html).not.toContain("data-sigapro-document-preboot");
    expect(main).not.toContain("buildRefreshVisualSnapshot");
    expect(main).not.toContain("collectSnapshotCss");
    expect(main).not.toContain("sigapro-app-stable");
  });

  it("never paints an empty root during F5", () => {
    expect(html).not.toContain("@view-transition");
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(html).not.toContain("sigapro-soft-refresh");
    expect(html).toContain('type="module"');
    expect(html).toContain('src="/src/main.tsx"');
    expect(html).toContain('blocking="render"');
    expect(html).toContain('fetchpriority="high"');
    expect(main).toContain('import { flushSync } from "react-dom"');
    expect(main).toContain("flushSync(() =>");
    expect(main).toContain("root.render(<App />)");
  });

  it("locks background and zoom before first paint and never clears zoom on teardown", () => {
    expect(html).toContain('window.localStorage.getItem("sigapro.last-page-background.v2")');
    expect(html).toContain('window.localStorage.getItem("sigapro-layout-theme.v2")');
    expect(html).toContain('window.localStorage.getItem("sigapro.effective-theme.v2")');
    expect(html).toContain('document.documentElement.style.setProperty("--sig-initial-bg", initialBackground)');
    expect(html).toContain("document.documentElement.style.zoom = initialAppZoom");
    expect(html).toContain('document.documentElement.setAttribute(');
    expect(html).toContain('"data-page-zoom"');
    expect(html).toContain("initialAppZoom");
  });

  it("treats same-user warm store as visually ready during F5 revalidation", () => {
    expect(platformData).toContain('source: "warm" as const');
    expect(platformData).toContain("contextUserId: warmStore.userId");
    expect(platformData).toContain('source === "warm"');
    expect(planEntitlements).toContain("hasStableCachedSession");
    expect(planEntitlements).toContain("hasStablePlanContext");
    expect(planEntitlements).toContain("explicitIdentityMismatch");
  });

  it("keeps the last verified process model available during a hard refresh", () => {
    expect(processDetail).toContain("sigapro.process-view.v1:");
    expect(processDetail).toContain("readCachedProcessVisual");
    expect(processDetail).toContain("writeCachedProcessVisual");
    expect(processDetail).toContain("const process = liveProcess ?? cachedProcessVisual");
  });

  it("keeps the current Analysis tab visible while the same session revalidates", () => {
    expect(processDetail).toContain("requestedTabForContinuity");
    expect(processDetail).toContain("analysisTabVisible");
    expect(processDetail).toContain('requestedTabForContinuity === "analise"');
    expect(processDetail).toContain("planEntitlements.isResolving");
  });

  it("persists the effective municipal theme so refresh cannot flash another palette", () => {
    expect(portal).toContain("readEffectiveThemeCache");
    expect(portal).toContain('"sigapro.effective-theme.v2"');
    expect(portal).toContain("stableMunicipalityTheme");
    expect(portal).toContain("municipalityLoading ? effectiveThemeCache?.background");
  });

  it("hydrates analysis checklist synchronously before first paint", () => {
    expect(urbanChecklist).toContain("readInitialChecklistState(key, process, session)");
    expect(urbanChecklist).toContain("useState<AnalysisChecklistState>(() =>");
    expect(urbanChecklist).not.toContain("useState<AnalysisChecklistState>(() => makeInitialState(process, session))");
  });

  it("persists process tab authorization per user and process across F5", () => {
    expect(processDetail).toContain("sigapro.process-tab-access.v1");
    expect(processDetail).toContain("readCachedProcessTabAccess");
    expect(processDetail).toContain("writeCachedProcessTabAccess");
    expect(processDetail).toContain("analysisTabVisible");
  });

  it("prevents localhost project crossing and transform waterfalls", () => {
    expect(viteConfig).toContain('host: "localhost"');
    expect(viteConfig).toContain('dns.setDefaultResultOrder("verbatim")');
    expect(viteConfig).toContain("strictPort: true");
    expect(viteConfig).toContain('"/api/dev-source"');
    expect(viteConfig).toContain("[SIGAPRO][DEV SOURCE]");
    expect(viteConfig).toContain("warmup:");
    expect(viteConfig).toContain('"./src/pages/saas/ProcessDetailPage.tsx"');
  });

  it("loads critical process styles before the first React paint", () => {
    expect(html).toContain('href="/src/components/platform/ProcessIdentityPanel.css"');
    expect(html).toContain('href="/src/components/platform/AnalysisReadinessPanel.css"');
  });

  it("clears the local identity before navigation/network so account switching stays isolated", () => {
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
