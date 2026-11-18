import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const app=readFileSync("src/App.tsx","utf8");
const html=readFileSync("index.html","utf8");
const refresh=readFileSync("src/lib/seamlessInternalRefresh.ts","utf8");
const frame=readFileSync("src/components/platform/PortalFrame.tsx","utf8");
describe("SIGAPRO — first paint of real private frame after native F5",()=>{
  it("requests real frame and route chunks concurrently, before auth effects",()=>{
    expect(app).toContain('import { PersistentPortalFrameLayout } from "@/components/platform/PortalFrame";');
    expect(app).not.toContain('const PersistentPortalFrameLayout = lazy(');
    expect(app).toContain("void preloadCurrentInternalRoute(initialPath)?.catch(() => undefined);");
    expect(app.indexOf('import { PersistentPortalFrameLayout } from')).toBeLessThan(app.indexOf("const App = () =>"));
    expect(app).toContain('if (isWorkspaceBootPath(initialPath))');
  });
  it("never warms a protected document viewer or public login as a private frame",()=>{
    expect(app).toContain('function isWorkspaceBootPath(pathname: string): boolean');
    expect(app).toContain('/(visualizar|analisar)$');
    expect(app).toContain('void preloadCurrentPublicRoute(initialPath)?.catch');
    expect(app).toContain('import { PersistentPortalFrameLayout } from "@/components/platform/PortalFrame";');
  });
  it("retains real authorization guards, not a DOM image or a fake shell",()=>{
    expect(app).toContain("<PermissionRoute permission=");
    expect(app).toContain("<PlanModuleRoute module=");
    expect(frame).toContain("canMountInstitutionalFrame");
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(refresh).not.toContain("snapshot.html");
  });
  it("does not claim native browser-toolbar reload can always be stopped",()=>{
    expect(refresh).toContain('event.userInitiated === false');
    expect(refresh).not.toContain("nativeHardReloadUntil");
  });
});
