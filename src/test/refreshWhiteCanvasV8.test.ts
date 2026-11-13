import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const html = read("index.html");
const app = read("src/App.tsx");
const portal = read("src/components/platform/PortalFrame.tsx");
const pending = read("src/components/platform/SecureRoutePending.tsx");

describe("SIGAPRO F5 — root cause of white paint (V8)", () => {
  it("sets the real page colors BEFORE render-blocking CSS is loaded", () => {
    const criticalScript = html.indexOf('document.documentElement.style.setProperty("--sig-bg", initialBackground)');
    const firstStylesheet = html.indexOf('<link rel="stylesheet" href="/src/index.css"');
    const module = html.indexOf('<script type="module" src="/src/main.tsx"');
    expect(criticalScript).toBeGreaterThan(-1);
    expect(firstStylesheet).toBeGreaterThan(criticalScript);
    expect(module).toBeGreaterThan(firstStylesheet);
    expect(html).toContain('document.documentElement.style.setProperty("--sig-initial-bg", initialBackground)');
    expect(html).not.toContain('var initialBackground = isFullDocumentRoute ? "#2b3037" : "#f5f7fb"');
  });
  it("keeps root background synchronized with actual institutional theme changes", () => {
    expect(portal).toContain('document.documentElement.style.setProperty("--sig-initial-bg", pageBackground)');
    expect(portal).toContain('document.documentElement.style.setProperty("--sig-bg", pageBackground)');
    expect(portal).toContain('document.documentElement.style.setProperty("--sig-bg", updatedBackground)');
    expect(portal).toContain('window.localStorage.setItem("sigapro.last-page-background.v2", pageBackground)');
  });
  it("preloads real protected module without rendering it before permission checks", () => {
    expect(app).toContain("function preloadCurrentInternalRoute(pathname: string)");
    expect(app).toContain('void preloadCurrentInternalRoute(window.location.pathname)?.catch(() => undefined);');
    for (const route of ["/dashboard","/prefeitura/analise","/prefeitura/financeiro","/prefeitura/organograma","/prefeitura/protocolos","/prefeitura/processos"]) {
      expect(app).toContain('pathname.startsWith("'+route+'")');
    }
    expect(app).toContain('<PermissionRoute permission=');
    expect(app).toContain('<Suspense fallback={<SecureRoutePending surface="route"');
  });
  it("does not bring back any intermediate screen or sensitive DOM snapshot", () => {
    expect(pending).not.toContain("min-h-screen");
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(html).not.toContain("snapshot.html");
    expect(html).toContain('inset: auto 16px 16px auto;');
    expect(read("src/main.tsx")).toContain("flushSync(() =>");
    expect(read("src/lib/refreshContinuity.ts")).toContain("snapshot.userId === String(cachedSession.id)");
  });
});
