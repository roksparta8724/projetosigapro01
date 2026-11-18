// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lazy, Suspense, useDeferredValue } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const avatarApi = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/privateAvatarRead", () => ({
  privateAvatarObjectKey: (s: string) => s.startsWith("/api/profile-avatar-open?objectKey=") ? "profile-avatar" : "",
  resolveAuthorizedAvatarUrl: avatarApi.resolve,
}));
import {
  clearAuthorizedAvatarRuntimeCache,
  getAuthorizedAvatarRuntimeUrl,
  getLastAuthorizedAvatarRuntimeSource,
  loadAuthorizedAvatarRuntimeUrl,
} from "@/lib/authorizedAvatarRuntimeCache";

const raw = "/api/profile-avatar-open?objectKey=platform%2Fprofiles%2Favatars%2Fuser-one%2Fphoto.webp";
const appSource = readFileSync("src/App.tsx","utf8");
const portalSource = readFileSync("src/components/platform/PortalFrame.tsx","utf8");
const helperSource = readFileSync("src/lib/seamlessInternalRefresh.ts","utf8");
const avatarSource = readFileSync("src/components/platform/UserAvatar.tsx","utf8");

afterEach(() => {
  cleanup();
  clearAuthorizedAvatarRuntimeCache();
  avatarApi.resolve.mockReset();
});

describe("SIGAPRO — continuidade sem pulso entre módulos", () => {
  it("mantém a última rota real durante o suspense, sem shell/intersticial", async () => {
    let resolveNext!: (value: { default: () => JSX.Element }) => void;
    const Next = lazy(() => new Promise<{ default: () => JSX.Element }>(resolve => { resolveNext = resolve; }));
    function Controls() {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/prefeitura/financeiro")}>Financeiro</button>;
    }
    function StableRoutes() {
      const location = useLocation();
      const deferredLocation = useDeferredValue(location);
      return <Suspense fallback={<div>FALHA: tela intermediária</div>}>
        <Controls />
        <Routes location={deferredLocation}>
          <Route path="/prefeitura/processos" element={<main>Controle real de processos</main>} />
          <Route path="/prefeitura/financeiro" element={<Next />} />
        </Routes>
      </Suspense>;
    }
    render(<MemoryRouter initialEntries={["/prefeitura/processos"]}><StableRoutes /></MemoryRouter>);
    expect(screen.getByText("Controle real de processos")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Financeiro" })); });
    expect(screen.getByText("Controle real de processos")).toBeTruthy();
    expect(screen.queryByText("FALHA: tela intermediária")).toBeNull();
    await act(async () => { resolveNext({ default: () => <main>Financeiro pronto</main> }); });
    await waitFor(() => expect(screen.getByText("Financeiro pronto")).toBeTruthy());
  });

  it("aplica a retenção somente à mesma sessão autorizada, não ao login/logout", () => {
    expect(appSource).toContain("useDeferredValue(location)");
    expect(appSource).toContain("bootstrap.authResolved");
    expect(appSource).toContain("Boolean(bootstrap.authUserId)");
    expect(appSource).toContain("bootstrap.isReady");
    expect(appSource).toContain("isOperationalNavigationPath(location.pathname)");
    expect(appSource).toContain("isOperationalNavigationPath(deferredLocation.pathname)");
    expect(appSource).toContain("<Routes location={visibleRouteLocation}>");
    expect(appSource).toContain("<PermissionRoute permission=");
    expect(appSource).toContain("<SeamlessRefreshGate />");
    expect(helperSource).not.toContain("snapshot.html");
  });

  it("reutiliza avatar privado já validado na mesma conta e revoga no logout", async () => {
    const revoke = vi.fn();
    avatarApi.resolve.mockResolvedValue({ url: "blob:authorized/photo", revoke });
    expect(getLastAuthorizedAvatarRuntimeSource("user-one")).toBe("");
    expect(await loadAuthorizedAvatarRuntimeUrl("user-one",raw)).toBe("blob:authorized/photo");
    expect(getLastAuthorizedAvatarRuntimeSource("user-one")).toBe(raw);
    expect(getLastAuthorizedAvatarRuntimeSource("user-two")).toBe("");
    expect(getAuthorizedAvatarRuntimeUrl("user-one",raw)).toBe("blob:authorized/photo");
    expect(await loadAuthorizedAvatarRuntimeUrl("user-one",raw)).toBe("blob:authorized/photo");
    expect(avatarApi.resolve).toHaveBeenCalledTimes(1);
    clearAuthorizedAvatarRuntimeCache();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(getLastAuthorizedAvatarRuntimeSource("user-one")).toBe("");
    expect(getAuthorizedAvatarRuntimeUrl("user-one",raw)).toBe("");
  });

  it("não promove resposta de foto antiga após mudança de identidade", async () => {
    let finish!: (a: {url:string;revoke:()=>void})=>void;
    avatarApi.resolve.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = loadAuthorizedAvatarRuntimeUrl("user-one",raw);
    clearAuthorizedAvatarRuntimeCache();
    const revoke = vi.fn();
    finish({url:"blob:expired",revoke});
    await expect(pending).resolves.toBe("");
    expect(getLastAuthorizedAvatarRuntimeSource("user-one")).toBe("");
    expect(revoke).toHaveBeenCalledOnce();
  });


  it("captura atualização pela barra do navegador quando Navigation API marca userInitiated=false", async () => {
    const { installSeamlessInternalRefresh } = await import("@/lib/seamlessInternalRefresh");
    const listeners = new Map<string, (event: Record<string, unknown>) => void>();
    const navigation = {
      addEventListener: vi.fn((name: string, fn: (event: Record<string, unknown>) => void) => {
        listeners.set(name, fn);
      }),
      removeEventListener: vi.fn((name: string) => { listeners.delete(name); }),
    };
    Object.defineProperty(window, "navigation", { configurable: true, value: navigation });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const teardown = installSeamlessInternalRefresh({
      isAuthenticated: () => true,
      refresh,
    });
    let handler: (() => Promise<void>) | undefined;
    const navigateEvent = {
      navigationType: "reload", userInitiated: false, canIntercept: true,
      destination: { url: window.location.href },
      intercept: vi.fn((args: { handler: () => Promise<void> }) => { handler = args.handler; }),
    };
    listeners.get("navigate")?.(navigateEvent);
    expect(navigateEvent.intercept).toHaveBeenCalledOnce();
    expect(handler).toBeTypeOf("function");
    await handler?.();
    expect(refresh).toHaveBeenCalledOnce();
    teardown();
    Object.defineProperty(window, "navigation", { configurable: true, value: undefined });
  });

  it("mantém Shift+F5 como recarga completa sem tocar em dados protegidos", async () => {
    const { installSeamlessInternalRefresh } = await import("@/lib/seamlessInternalRefresh");
    const listeners = new Map<string, (event: Record<string, unknown>) => void>();
    Object.defineProperty(window, "navigation", { configurable: true, value: {
      addEventListener: (name: string, fn: (event: Record<string, unknown>) => void) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    } });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const teardown = installSeamlessInternalRefresh({ isAuthenticated: () => true, refresh });
    const key = new KeyboardEvent("keydown", { key: "F5", shiftKey: true, cancelable: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    const intercept = vi.fn();
    listeners.get("navigate")?.({
      navigationType: "reload", userInitiated: true, canIntercept: true,
      destination: { url: window.location.href }, intercept,
    });
    expect(intercept).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    teardown();
    Object.defineProperty(window, "navigation", { configurable: true, value: undefined });
  });

  it("usa bitmap de avatar pequeno sem escalonar o frame e mantém isenção do shell artificial", () => {
    expect(avatarSource).toContain('decoding="sync"');
    expect(portalSource).toContain("getLastAuthorizedAvatarRuntimeSource(authenticatedAvatarOwnerId)");
    expect(portalSource).toContain('photoRemovalConfirmed={topbarPhotoRemovalConfirmed}');
    expect(appSource).not.toContain("snapshot.html");
  });
});
