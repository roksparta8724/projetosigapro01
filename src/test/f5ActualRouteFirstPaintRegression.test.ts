import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("SIGAPRO F5 — first paint and real route, without a fake shell", () => {
  it("applies the actual page palette before CSS and avoids unrelated blocking styles", () => {
    const html = read("index.html");
    const criticalColor = html.indexOf('document.documentElement.style.setProperty("--sig-bg", initialBackground)');
    const mainCss = html.indexOf('<link rel="stylesheet" href="/src/index.css"');
    const module = html.indexOf('<script type="module" src="/src/main.tsx"');
    expect(criticalColor).toBeGreaterThan(0);
    expect(mainCss).toBeGreaterThan(criticalColor);
    expect(module).toBeGreaterThan(mainCss);
    expect(html).not.toContain('href="/src/components/platform/ProcessIdentityPanel.css"');
    expect(html).not.toContain('href="/src/components/platform/AnalysisReadinessPanel.css"');
    expect(read("src/components/platform/ProcessIdentityPanel.tsx")).toContain('import "./ProcessIdentityPanel.css";');
    expect(read("src/components/platform/AnalysisReadinessPanel.tsx")).toContain('import "./AnalysisReadinessPanel.css";');
    expect(html).not.toContain("background-color: #153a52 !important;");
  });

  it("preloads the actual Arrecadação module instead of the generic Prefeitura page", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("function preloadCurrentInternalRoute(pathname: string)");
    expect(app).toContain('if (pathname.startsWith("/prefeitura/arrecadacao")) return import("@/pages/saas/CollectionSettingsPage");');
    expect(app.indexOf('pathname.startsWith("/prefeitura/arrecadacao")')).toBeLessThan(
      app.indexOf('pathname.startsWith("/prefeitura")) return import("@/pages/saas/TenantAdminPage")'),
    );
    expect(app).toContain('void preloadCurrentInternalRoute(window.location.pathname)?.catch(() => undefined);');
    expect(app).toContain('<PermissionRoute permission="view_collection_settings">');
    expect(app).toContain('<PlanModuleRoute module="Configurações">');
    expect(app).toContain("<CollectionSettingsPage />");
    expect(app).toContain("<SeamlessRefreshGate />");
  });

  it("refreshes data without tearing down the app, including mobile/desktop controls", () => {
    const frame = read("src/components/platform/PortalFrame.tsx");
    expect(frame).toContain('document.documentElement.style.setProperty("--sig-initial-bg", pageBackground);');
    expect(frame).toContain('document.documentElement.style.setProperty("--sig-bg", pageBackground);');
    expect(frame).toContain('window.localStorage.setItem("sigapro.last-page-background.v2", pageBackground)');
    expect(frame).toContain("const refreshWithoutPageReload = async () => {");
    expect(frame).toContain("await refreshRemoteStore();");
    expect(frame.match(/aria-label="Atualizar dados sem recarregar a página"/g)).toHaveLength(2);
    const handler = frame.slice(frame.indexOf("const refreshWithoutPageReload"), frame.indexOf("// Revalidate permissions"));
    expect(handler).not.toContain("window.location.reload");
  });

  it("preserves permissions and documents rather than snapshotting protected DOM", () => {
    const helper = read("src/lib/seamlessInternalRefresh.ts");
    const sw = read("public/sigapro-sw.js");
    const app = read("src/App.tsx");
    const pending = read("src/components/platform/SecureRoutePending.tsx");
    expect(helper).toContain('the browser\'s own Reload button');
    expect(helper).toContain("eligible same-document navigations");
    expect(helper).toContain("options.isAuthenticated()");
    expect(helper).not.toContain("sessionStorage");
    expect(helper).not.toContain("innerHTML");
    expect(sw).toContain('fetch(request, { cache: "no-store" })');
    expect(app).toContain("<PermissionRoute permission=");
    expect(pending).not.toContain("min-h-screen");
  });
});
