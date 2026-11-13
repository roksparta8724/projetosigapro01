import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("SIGAPRO: primeiro quadro real sem JS desnecessário", () => {
  it("não importa telas de marketing e login estaticamente no bundle de Prefeitura", () => {
    const publicPages = ["AcessoPage", "LandingPage", "RecuperarSenhaPage", "CriarContaPage", "PublicPlansPage", "PublicSignatureVerificationPage"];
    for (const page of publicPages) {
      expect(app).not.toContain(`import { ${page} } from "@/pages/saas/${page}";`);
      expect(app).toContain(`const ${page} = lazy(() => import("@/pages/saas/${page}")`);
    }
  });

  it("antecipa apenas o chunk público correto, sem atrasar o chunk real protegido", () => {
    expect(app).toContain("function preloadCurrentPublicRoute(pathname: string)");
    expect(app).toContain('if (pathname === "/acesso") return import("@/pages/saas/AcessoPage");');
    expect(app).toContain('if (pathname === "/criar-conta") return import("@/pages/saas/CriarContaPage");');
    expect(app).toContain('if (pathname === "/verificar-assinatura" || pathname.startsWith("/v/")) return import("@/pages/saas/PublicSignatureVerificationPage");');
    expect(app).toContain("function preloadCurrentInternalRoute(pathname: string)");
    expect(app).toContain('if (pathname.startsWith("/prefeitura")) return import("@/pages/saas/TenantAdminPage");');
    expect(app).toContain("void preloadCurrentPublicRoute(window.location.pathname)?.catch(() => undefined);");
    expect(app).toContain("void preloadCurrentInternalRoute(window.location.pathname)?.catch(() => undefined);");
  });

  it("mantém as mesmas rotas e PermissionRoute, sem liberar sessão durante o preload", () => {
    expect(app).toContain('path="/acesso" element={<AcessoPage />}');
    expect(app).toContain('path="/criar-conta" element={<CriarContaPage />}');
    expect(app).toContain('<PermissionRoute permission="manage_tenant_users">');
    expect(app).toContain('<PermissionRoute permission="manage_own_profile">');
    expect(app).toContain("<SeamlessRefreshGate />");
    expect(app).toContain("<PlatformDataProvider>");
  });
});
