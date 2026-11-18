import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/App.tsx", "utf8");
const portal = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
const pending = readFileSync("src/components/platform/SecureRoutePending.tsx", "utf8");

describe("SIGAPRO — institutional first paint without post-mount layout suspense", () => {
  it("ships the genuine authorized frame in the initial app module", () => {
    expect(app).toContain('import { PersistentPortalFrameLayout } from "@/components/platform/PortalFrame";');
    expect(app).toContain('<Route element={<PersistentPortalFrameLayout />}>');
    expect(app).not.toContain('const PersistentPortalFrameLayout = lazy(');
    expect(app).not.toContain('void import("@/components/platform/PortalFrame").catch');
  });
  it("preserves each route permission and genuine page module lazy loading", () => {
    expect(app).toContain('const FinanceDeskPage = lazy(');
    expect(app).toContain('const DashboardHomePage = lazy(');
    expect(app).toContain("<PermissionRoute permission=");
    expect(app).toContain("<PlanModuleRoute module=");
    expect(app).toContain("void preloadCurrentInternalRoute(initialPath)?.catch(() => undefined);");
    expect(portal).toContain('export function PersistentPortalFrameLayout()');
    expect(portal).toContain('const canMountInstitutionalFrame = verifiedSession || sameAccountRefresh');
  });
  it("keeps topbar/sidebar/profile outside child page suspense", () => {
    const start = portal.indexOf('export function PersistentPortalFrameLayout()');
    const end = portal.indexOf('export function PortalFrame(', start);
    const segment = portal.slice(start, end);
    expect(segment).toContain('<PortalFrameSurface {...presentation}>');
    expect(segment).toMatch(/<PortalFrameSurface[^>]*>[\s\S]*?<Suspense fallback=[\s\S]*?<Outlet \/>/);
    expect(pending).not.toContain("min-h-screen");
  });
});
