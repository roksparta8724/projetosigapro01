import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const portal = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
const gate = readFileSync("src/components/platform/SeamlessRefreshGate.tsx", "utf8");
const refresh = readFileSync("src/lib/seamlessInternalRefresh.ts", "utf8");

describe("SIGAPRO — in-place data refresh keeps visible frame and profile stationary", () => {
  it("does not toggle a topbar-wide loading state on each data refresh", () => {
    expect(portal).toContain("const refreshingVisibleDataRef = useRef(false)");
    expect(portal).toContain('if (refreshingVisibleDataRef.current || session.id === "unknown") return');
    expect(portal).toContain("refreshingVisibleDataRef.current = true");
    expect(portal).toContain("refreshingVisibleDataRef.current = false");
    expect(portal).not.toContain("setRefreshingVisibleData");
    expect(portal).not.toContain("const [refreshingVisibleData,");
  });
  it("keeps both institutional refresh buttons visually static, without spinning icons", () => {
    expect(portal.split('onClick={() => void refreshWithoutPageReload()}').length - 1).toBe(2);
    expect(portal).toContain('aria-label="Atualizar dados sem recarregar a página"');
    expect(portal).not.toContain('refreshingVisibleData && "animate-spin"');
    expect(portal).toContain('<RefreshCw aria-hidden="true" className="h-[18px] w-[18px] text-white/92" />');
    expect(portal).toContain('<RefreshCw aria-hidden="true" className="h-[18px] w-[18px]" />');
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
