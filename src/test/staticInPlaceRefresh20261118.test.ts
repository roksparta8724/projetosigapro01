import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const portal = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
const gate = readFileSync("src/components/platform/SeamlessRefreshGate.tsx", "utf8");
const refresh = readFileSync("src/lib/seamlessInternalRefresh.ts", "utf8");

describe("SIGAPRO — in-place data refresh keeps visible frame and profile stationary", () => {
  it("keeps background revalidation independent from the mounted topbar", () => {
    expect(portal).toContain("useLivePlatformRefresh(refreshRemoteStore,");
    expect(portal).toContain("refreshOnMount: false");
    expect(portal).not.toContain("setRefreshingVisibleData");
    expect(portal).not.toContain("const [refreshingVisibleData,");
  });
  it("removes redundant desktop/mobile refresh buttons without disabling real background synchronization", () => {
    expect(portal).not.toContain('aria-label="Atualizar dados sem recarregar a página"');
    expect(portal).not.toContain("refreshWithoutPageReload");
    expect(portal).not.toContain("<RefreshCw");
    expect(portal).toContain("useLivePlatformRefresh(refreshRemoteStore,");
  });
  it("does not navigate, replace root or force a browser document reload", () => {
    const start = portal.indexOf("const refreshWithoutPageReload = async () => {");
    const end = portal.indexOf("useLivePlatformRefresh(refreshRemoteStore", start);
    const body = portal.slice(start, end);
    expect(body).toContain("await refreshRemoteStore()");
    expect(body).not.toContain("window.location");
    expect(body).not.toContain("navigate(");
    expect(body).not.toContain("root.render");
    expect(gate).toContain("canRefreshMountedWorkspace");
    expect(refresh).toContain('event.navigationType !== "reload"');
  });
});
