import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO — login sempre no build correto e autenticacao isolada", () => {
  it("preview não serve HTML JS antigo nem autenticação antiga após novo deploy", () => {
    const sw = source("public/sigapro-sw.js");
    const navigation = sw.split("async function respondToNavigation(request, event) {")[1];
    expect(sw).toContain('CACHE_VERSION = "sigapro-enterprise-v10"');
    expect(sw).toContain("const IS_SIGAPRO_PREVIEW =");
    expect(sw).toContain("const IS_MUTABLE_PREVIEW_ALIAS =");
    expect(navigation).toContain("if (IS_MUTABLE_APP_HOST || isIdentityRoute)");
    expect(navigation).toContain('fetch(request, { cache: "no-store", credentials: "same-origin" })');
    expect(navigation).toContain("if (IS_SIGAPRO_PREVIEW) return Response.error()");
    expect(navigation).toContain("await isVerifiedPublicAppDocument(response)");
  });

  it("acesso é compacto e abre no topo mesmo após sair de um processo longo", () => {
    const page = source("src/pages/saas/AcessoPage.tsx");
    expect(page).toContain('data-sigapro-public-login="true"');
    expect(page).toContain('useLayoutEffect(() => {');
    expect(page).toContain('window.scrollTo(0, 0)');
    expect(page).toContain('window.history.scrollRestoration = "manual"');
    expect(page).toContain('max-w-[760px] grid-cols-[104px_minmax(0,1fr)]');
    expect(page).not.toContain('scale-[2.3]');
    expect(page).toContain('Carregar versão atual da homologação');
    expect(page).toContain('role="alert"');
    expect(page).toContain('onSubmit={handleSubmit}');
  });

  it("não publica o login QA com Neon Auth/Data API ausentes, misturados ou produção", () => {
    const vite = source("vite.config.ts");
    const runtime = source("src/integrations/backend/databaseClient.ts");
    expect(vite).toContain("SIGAPRO_QA_AUTH_CONFIG_INVALID");
    expect(vite).toContain('process.env.VERCEL_ENV === "preview"');
    expect(vite).toContain('VITE_SIGAPRO_NEON_ISOLATED');
    expect(vite).toContain('authEndpoint !== "ep-misty-breeze-b4ri8ig0"');
    expect(vite).toContain('dataEndpoint !== authEndpoint');
    expect(runtime).toContain('qaIsolationRequired && qaIsolationFlag');
    expect(runtime).toContain('neonEndpointIdentity(localAuthOverride) === neonEndpointIdentity(localDataOverride)');
  });

  it("Vercel impede cache das páginas de autenticação e mantém publicação como SPA", () => {
    const config = JSON.parse(source("vercel.json")) as {
      headers: Array<{source: string, headers: Array<{key: string, value: string}>}>;
      rewrites: Array<{source: string, destination: string}>;
    };
    for (const path of ["/acesso", "/recuperar-senha", "/criar-conta", "/sigapro-sw.js"]) {
      const entry = config.headers.find((item) => item.source === path);
      expect(entry?.headers.some((header) =>
        header.key === "Cache-Control" && header.value.includes("no-store")
      )).toBe(true);
    }
    const spa = config.rewrites.find(item => item.destination === "/index.html");
    expect(spa).toBeDefined();
    const rule = new RegExp("^" + spa!.source + "$");
    expect(rule.test("/prefeitura")).toBe(true);
    expect(rule.test("/acesso")).toBe(true);
    expect(rule.test("/assets/PortalFrame-BZ04PhkO.js")).toBe(false);
  });
});
