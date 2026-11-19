// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasValidRefreshContinuity, REFRESH_CONTINUITY_KEY, PLATFORM_SESSION_CACHE_KEY } from "@/lib/refreshContinuity";

const state = vi.hoisted(() => ({
  location: { pathname: "/prefeitura/protocolos", search: "", hash: "" },
  auth: {
    authResolved: true,
    isAuthenticated: true,
    authenticatedUserId: "municipal-user-1" as string | null,
  },
  session: {
    id: "municipal-user-1",
    role: "analista",
    accountStatus: "active",
    deletedAt: null as string | null,
  },
  refresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => state.location,
}));
vi.mock("@/hooks/useAuthGateway", () => ({
  useAuthGateway: () => state.auth,
}));
vi.mock("@/hooks/usePlatformSession", () => ({
  usePlatformSession: () => ({ session: state.session }),
}));
vi.mock("@/hooks/usePlatformData", () => ({
  usePlatformData: () => ({ refreshRemoteStore: state.refresh }),
}));

import { SeamlessRefreshGate } from "@/components/platform/SeamlessRefreshGate";

function navigateTo(path: string) {
  window.history.replaceState(null, "", path);
  const url = new URL(window.location.href);
  state.location = { pathname: url.pathname, search: url.search, hash: url.hash };
}

function mountedActualWorkspace() {
  const frame = document.createElement("main");
  frame.className = "sig-app-frame";
  frame.textContent = "SIGAPRO — interface real da Prefeitura";
  document.body.append(frame);
  return frame;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  state.auth = {
    authResolved: true,
    isAuthenticated: true,
    authenticatedUserId: "municipal-user-1",
  };
  state.session = {
    id: "municipal-user-1", role: "analista", accountStatus: "active", deletedAt: null,
  };
  state.refresh.mockClear();
  navigateTo("/prefeitura/protocolos");
  window.localStorage.setItem(PLATFORM_SESSION_CACHE_KEY, JSON.stringify({
    id: "municipal-user-1", role: "analista", accountStatus: "active",
  }));
});

afterEach(() => {
  cleanup();
  document.querySelector(".sig-app-frame")?.remove();
  window.localStorage.clear();
  window.sessionStorage.clear();
  navigateTo("/");
});

describe("SIGAPRO — primeira atualização ao mudar de guia", () => {
  it("grava a rota autenticada imediatamente, antes do primeiro F5 da nova guia", async () => {
    const frame = mountedActualWorkspace();
    const { rerender } = render(<SeamlessRefreshGate />);

    expect(hasValidRefreshContinuity("/prefeitura/protocolos")).toBe(true);

    // Reproduz: Protocolo -> Mesa Técnica -> primeira atualização.
    navigateTo("/prefeitura/analise");
    expect(hasValidRefreshContinuity()).toBe(false);
    await act(async () => rerender(<SeamlessRefreshGate />));
    expect(hasValidRefreshContinuity()).toBe(true);
    const marker = JSON.parse(window.sessionStorage.getItem(REFRESH_CONTINUITY_KEY) || "{}");
    expect(marker.location).toBe("/prefeitura/analise");
    expect(marker.userId).toBe("municipal-user-1");
    expect(document.querySelector(".sig-app-frame")).toBe(frame);

    // Outra troca de guia também deve estar pronta ANTES do seu primeiro F5.
    navigateTo("/prefeitura/financeiro");
    await act(async () => rerender(<SeamlessRefreshGate />));
    expect(hasValidRefreshContinuity()).toBe(true);
    expect(document.querySelector(".sig-app-frame")).toBe(frame);
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("sincroniza subguia, querystring e hash sem remontar a página", async () => {
    const frame = mountedActualWorkspace();
    const { rerender } = render(<SeamlessRefreshGate />);

    navigateTo("/prefeitura/processos?fila=pendentes#urgentes");
    await act(async () => rerender(<SeamlessRefreshGate />));
    expect(hasValidRefreshContinuity()).toBe(true);
    expect(JSON.parse(window.sessionStorage.getItem(REFRESH_CONTINUITY_KEY) || "{}").location)
      .toBe("/prefeitura/processos?fila=pendentes#urgentes");
    expect(document.querySelector(".sig-app-frame")).toBe(frame);
  });

  it("não cria continuidade se a conta ainda não estiver confirmada", async () => {
    mountedActualWorkspace();
    state.auth = { authResolved: false, isAuthenticated: false, authenticatedUserId: null };
    const { rerender } = render(<SeamlessRefreshGate />);
    expect(window.sessionStorage.getItem(REFRESH_CONTINUITY_KEY)).toBeNull();

    navigateTo("/prefeitura/analise");
    await act(async () => rerender(<SeamlessRefreshGate />));
    expect(window.sessionStorage.getItem(REFRESH_CONTINUITY_KEY)).toBeNull();
  });

  it("não confia no cache de outra conta, nem em sessão bloqueada", async () => {
    mountedActualWorkspace();
    window.localStorage.setItem(PLATFORM_SESSION_CACHE_KEY, JSON.stringify({
      id: "outro-usuario", role: "prefeitura_admin", accountStatus: "active",
    }));
    const { rerender } = render(<SeamlessRefreshGate />);
    expect(window.sessionStorage.getItem(REFRESH_CONTINUITY_KEY)).toBeNull();

    window.localStorage.setItem(PLATFORM_SESSION_CACHE_KEY, JSON.stringify({
      id: "municipal-user-1", role: "analista", accountStatus: "active",
    }));
    state.session = { ...state.session, accountStatus: "blocked" };
    navigateTo("/prefeitura/analise");
    await act(async () => rerender(<SeamlessRefreshGate />));
    expect(window.sessionStorage.getItem(REFRESH_CONTINUITY_KEY)).toBeNull();
  });

  it("não registra rotas públicas nem exibição isolada de documentos", async () => {
    mountedActualWorkspace();
    navigateTo("/acesso");
    const { rerender } = render(<SeamlessRefreshGate />);
    expect(window.sessionStorage.getItem(REFRESH_CONTINUITY_KEY)).toBeNull();
    navigateTo("/processos/p1/documentos/d1/visualizar");
    await act(async () => rerender(<SeamlessRefreshGate />));
    expect(window.sessionStorage.getItem(REFRESH_CONTINUITY_KEY)).toBeNull();
  });
});
