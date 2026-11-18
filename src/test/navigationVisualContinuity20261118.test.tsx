// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const app = read("src/App.tsx");
const frame = read("src/components/platform/PortalFrame.tsx");
const auth = read("src/hooks/useAuthorizedAvatarUrl.ts");
const cache = read("src/lib/authorizedAvatarRuntimeCache.ts");
const refresh = read("src/lib/seamlessInternalRefresh.ts");

describe("SIGAPRO — root do portal persistente, sem duas interfaces por troca", () => {
  it("cria uma única estrutura de portal acima das rotas operacionais", () => {
    expect(app).toContain('const PersistentPortalFrameLayout = lazy(');
    expect(app).toContain('<Route element={<PersistentPortalFrameLayout />}>');
    expect(app).toContain('path="/prefeitura/protocolos"');
    expect(app).toContain('path="/prefeitura/analise"');
    expect(app).toContain('path="/prefeitura/financeiro"');
    expect(app).toContain('path="/prefeitura/processos"');
    expect(app).toContain('path="/dashboard/*"');
    expect(app).toContain('path="/perfil"');
    expect(app).toContain('path="/processos/:processId"');
    expect(app).toContain('path="/externo/controle"');
    expect(app).toContain("<PermissionRoute permission=");
    expect(app).toContain("<PlanModuleRoute module=");
  });

  it("apenas o miolo troca; topbar, avatar, sidebar e rodapé mantêm a identidade no DOM", () => {
    expect(frame).toContain('export function PersistentPortalFrameLayout()');
    expect(frame).toContain('const PersistentPortalFrameContext = createContext<');
    expect(frame).toContain('const setPresentationIfChanged = useCallback(');
    expect(frame).toContain('return <PortalFrameSurface {...presentation}>');
    expect(frame).toContain('<PortalFrameSurface {...presentation}>');
    expect(frame).toMatch(/<PortalFrameSurface \{\.\.\.presentation\}>[\s\S]*?<Suspense fallback=[\s\S]*?<Outlet \/>/);
    expect(frame).toContain('function PortalFrameSurface(');
    expect(frame).toContain('if (register) return <>{children}</>;');
    expect(frame).toContain('register({ title, eyebrow, focusMode, compactHeader, hideSectionHeader })');
    expect(frame).toContain("prev.title === next.title");
    expect(frame).toContain("prev.eyebrow === next.eyebrow");
    expect(frame).toContain("sig-app-frame min-h-screen text-foreground");
  });

  it("não mantém páginas com URL antiga em rota autenticada nova", () => {
    expect(app).not.toContain("useDeferredValue(location)");
    expect(app).not.toContain("visibleRouteLocation");
    expect(app).toContain("<Routes>");
    expect(app).not.toContain("Routes location=");
  });

  it("mantém autenticação por rota e nunca monta frame para conta bloqueada", () => {
    expect(frame).toContain("auth.authResolved && auth.isAuthenticated &&");
    expect(frame).toContain("Boolean(auth.authenticatedUserId)");
    expect(frame).toContain('session.id !== "unknown"');
    expect(frame).toContain('session.accountStatus !== "blocked"');
    expect(frame).toContain('session.accountStatus !== "inactive"');
    expect(frame).toContain('cachedSessionIdentity?.id === session.id');
    expect(frame).toContain("hasValidRefreshContinuity()");
    expect(frame).toContain("!auth.authResolved &&");
    expect(frame).toContain("verifiedSession || sameAccountRefresh");
    expect(frame).toContain("if (!canMountInstitutionalFrame) return <Outlet />");
    expect(app).toContain('path="/processos/:processId/documentos/:documentId/visualizar"');
  });

  it("não reintroduz fallback público, shell falso ou snapshot de dados protegidos", () => {
    expect(frame).toContain("SecureRoutePending");
    expect(app).toContain("<SeamlessRefreshGate />");
    expect(refresh).not.toContain("snapshot.html");
    expect(refresh).not.toContain("innerHTML");
  });

  it("reverte o cache adicional de foto e a interceptação de reload sem autoria explícita", () => {
    expect(frame).not.toContain("getLastAuthorizedAvatarRuntimeSource");
    expect(cache).not.toContain("lastVerifiedSource");
    expect(auth).not.toContain("if (getAuthorizedAvatarRuntimeUrl(owner, raw)) return;");
    expect(refresh).not.toContain('event.userInitiated === false');
    expect(refresh).toContain('event.navigationType !== "reload"');
    expect(refresh).toContain("Date.now() < nativeHardReloadUntil");
    expect(refresh).not.toContain("nativeHardReloadUntil");
  });

  it("preserva o mesmo avatar apenas enquanto a identidade está autorizada", () => {
    expect(frame).toContain('authenticatedOwnerId={authenticatedAvatarOwnerId}');
    expect(frame).toContain('photoRemovalConfirmed={topbarPhotoRemovalConfirmed}');
    expect(cache).toContain("clearAuthorizedAvatarRuntimeCache");
    expect(cache).toContain("cached.get(cacheId(owner, source))");
  });
});
