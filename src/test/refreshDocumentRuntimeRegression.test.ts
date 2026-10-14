import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("refresh and secure document runtime regressions", () => {
  const main = read("src/main.tsx");
  const permissionRoute = read("src/components/platform/PermissionRoute.tsx");
  const planModuleRoute = read("src/components/platform/PlanModuleRoute.tsx");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const documentViewer = read("src/pages/saas/DocumentViewerPage.tsx");
  const r2Client = read("src/integrations/r2/client.ts");
  const viteConfig = read("vite.config.ts");
  const guide = read("src/components/GuiaRecolhimentoOficial.tsx");

  it("mounts React before local cache maintenance on F5", () => {
    expect(main).toContain('import App from "./App.tsx"');
    expect(main).not.toContain('await import("./App.tsx")');
    const renderIndex = main.indexOf("createRoot(rootElement).render(<App />)");
    const cacheIndex = main.indexOf("void clearLocalDevelopmentCaches()");
    expect(renderIndex).toBeGreaterThanOrEqual(0);
    expect(cacheIndex).toBeGreaterThan(renderIndex);
    expect(main).not.toContain("window.scrollTo");
  });

  it("never returns a blank authenticated route while access is resolving", () => {
    expect(permissionRoute).not.toContain("return null;");
    expect(permissionRoute).toContain("Restaurando sessão");
    expect(permissionRoute).toContain("Restaurando documento");
    expect(planModuleRoute).toContain("<PortalFrame");
    expect(planModuleRoute).not.toContain("Validando acesso da Prefeitura");
    expect(planModuleRoute).toContain("Confirmando o acesso sem desmontar topbar, menu, conteúdo-base e rodapé");
  });

  it("opens process documents directly through a signed R2 URL", () => {
    expect(processDetail).toContain("getSignedUrlForObjectStrict");
    expect(processDetail).toContain('const popup = window.open("", "_blank")');
    expect(processDetail).toContain("popup.location.replace(accessUrl)");
    expect(processDetail).not.toContain("window.open(viewerUrl");
    expect(documentViewer).not.toContain("Carregando documento com acesso seguro...");
    expect(documentViewer).toContain("documentContextResolving");
    expect(documentViewer).toContain("window.location.replace(accessUrl)");
  });

  it("falls back to the official read API when localhost R2 config is incomplete", () => {
    expect(r2Client).toContain("response.clone().json()");
    expect(r2Client).toContain("localInfrastructureFailure");
    expect(r2Client).toContain("return requestSignedUrl(officialUrl, input)");
    expect(r2Client).toContain('const officialReadApiBase = "https://sigapromunicipal.com.br"');
  });

  it("inherits local development env from the primary git worktree without affecting production builds", () => {
    expect(viteConfig).toContain("resolvePrimaryWorktreeEnvDir");
    expect(viteConfig).toContain("loadDevelopmentEnvWithWorktreeFallback");
    expect(viteConfig).toContain('mode !== "development"');
    expect(viteConfig).toContain("SIGAPRO_DEV_ENV_SOURCE");
    expect(viteConfig).toContain("[SIGAPRO][DevEnv]");
  });

  it("never emits a remote broken logo into static guide HTML", () => {
    expect(guide).toContain("const staticLogo");
    expect(guide).toContain('/^data:image\\//i.test(staticLogo)');
    expect(guide).toContain('logoUrl: /^data:image\\//i.test(staticLogo) ? staticLogo : ""');
    expect(guide).not.toContain("Preparando a guia oficial...");
  });
});
