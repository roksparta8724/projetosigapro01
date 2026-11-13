import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const html = read("index.html");
const app = read("src/App.tsx");
const frame = read("src/components/platform/PortalFrame.tsx");
const gate = read("src/components/platform/SeamlessRefreshGate.tsx");
const helper = read("src/lib/seamlessInternalRefresh.ts");

describe("SIGAPRO F5 V10: no unprotected refresh listener gaps or bright boot canvas", () => {
  it("uses exactly one stable gate above the route tree; never in PortalFrame", () => {
    expect(app).toContain("<SeamlessRefreshGate />");
    expect(app.indexOf("<SeamlessRefreshGate />")).toBeLessThan(app.indexOf("<AppRoutes />"));
    expect(gate).toContain("useLayoutEffect");
    expect(gate).toContain("auth.authResolved");
    expect(gate).toContain("auth.isAuthenticated");
    expect(gate).toContain("auth.authenticatedUserId");
    expect(gate).toContain('session.id !== "unknown"');
    expect(gate).toContain('session.accountStatus !== "blocked"');
    expect(gate).toContain('session.accountStatus !== "inactive"');
    expect(gate).toContain("!session.deletedAt");
    expect(frame).not.toContain("installSeamlessInternalRefresh");
  });

  it("refreshes official data in-place without storing privileged DOM", () => {
    expect(gate).toContain("latest.current.refreshRemoteStore()");
    expect(helper).toContain("event.navigationType !== \"reload\"");
    expect(helper).toContain("event.userInitiated === false");
    expect(helper).toContain("event.intercept({");
    expect(helper).toContain("to.origin === from.origin");
    expect(helper).toContain("to.pathname === from.pathname");
    expect(helper).toContain('document.visibilityState === "hidden"');
    expect(helper).not.toContain("sessionStorage");
    expect(helper).not.toContain("innerHTML");
    expect(gate).not.toContain("localStorage");
  });

  it("does not paint an artificial blue full-viewport replacement canvas", () => {
    // O fundo azul artificial era a própria tela intermediária denunciada no vídeo.
    expect(html).not.toContain("background-color: #153a52 !important;");
    expect(html).not.toContain("inset: 0;\n        z-index: 99999;");
    expect(html).toContain('document.documentElement.style.setProperty("--sig-bg", initialBackground)');
    expect(html).toContain('document.documentElement.setAttribute("data-sigapro-cached-internal", "true")');
    expect(html).toContain('document.documentElement.setAttribute("data-sigapro-initial-render", "true")');
    expect(read("src/main.tsx")).toContain('document.documentElement.removeAttribute("data-sigapro-initial-render")');
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(html).not.toContain("<canvas");
  });

  it("removes preboot after React commits a real app or a hidden authorization status", () => {
    const entry = read("src/main.tsx");
    expect(entry).toContain("new MutationObserver(finishBootstrap)");
    expect(entry).toContain("if (!rootElement.hasChildNodes()) return;");
    expect(entry).toContain("finishBootstrap();");
    expect(entry).toContain('document.documentElement.removeAttribute("data-sigapro-initial-render")');
    expect(entry).toContain("mountedObserver?.disconnect()");
    expect(entry).not.toContain('window.requestAnimationFrame(() => {\n      document.documentElement.removeAttribute("data-sigapro-initial-render");');
  });

  it("does not change public login, printable documents, real data, or payment surfaces", () => {
    expect(html).toContain('publicPaths = ["/", "/inicio", "/apresentacao", "/planos-publicos"]');
    expect(html).toContain('authPaths = ["/acesso", "/criar-conta", "/recuperar-senha"]');
    expect(app).toContain("<PermissionRoute permission=");
    expect(app).toContain("<PlanModuleRoute");
    expect(html).toContain('data-sigapro-document-route');
    expect(helper).toContain("(visualizar|analisar)$");
  });
});
