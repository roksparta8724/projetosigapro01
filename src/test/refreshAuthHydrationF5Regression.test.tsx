// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: {
    authResolved: false,
    isAuthenticated: false,
    authenticatedUserId: null as string | null,
  },
  session: {
    id: "municipal-user-1",
    role: "prefeitura_admin",
    accountStatus: "active",
    deletedAt: null as string | null,
  },
  pathname: "/prefeitura/arrecadacao",
  refresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: state.pathname }),
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

import { canRefreshMountedWorkspace, SeamlessRefreshGate } from "@/components/platform/SeamlessRefreshGate";

beforeEach(() => {
  state.auth = { authResolved: false, isAuthenticated: false, authenticatedUserId: null };
  state.session = { id: "municipal-user-1", role: "prefeitura_admin", accountStatus: "active", deletedAt: null };
  state.pathname = "/prefeitura/arrecadacao";
  state.refresh.mockClear();
});

afterEach(() => {
  cleanup();
  document.querySelector(".sig-app-frame")?.remove();
});

function makeRealWorkspace() {
  const frame = document.createElement("main");
  frame.className = "sig-app-frame";
  frame.textContent = "Prefeitura — Guias e Arrecadação";
  document.body.append(frame);
  return frame;
}

function keyboard(key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  window.dispatchEvent(event);
  return event;
}

describe("F5 durante a restauração da conta municipal", () => {
  it("mantém a interface real montada e não transforma F5 em hard reload durante a hidratação", async () => {
    const frame = makeRealWorkspace();
    const { rerender } = render(<SeamlessRefreshGate />);

    await act(async () => {
      expect(keyboard("F5").defaultPrevented).toBe(true);
    });
    expect(document.querySelector(".sig-app-frame")).toBe(frame);
    expect(state.refresh).not.toHaveBeenCalled();

    state.auth = { authResolved: true, isAuthenticated: true, authenticatedUserId: "municipal-user-1" };
    await act(async () => {
      rerender(<SeamlessRefreshGate />);
    });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".sig-app-frame")).toBe(frame);

    await act(async () => {
      expect(keyboard("r", { ctrlKey: true }).defaultPrevented).toBe(true);
    });
    expect(state.refresh).toHaveBeenCalledTimes(2);
    expect(document.querySelector(".sig-app-frame")).toBe(frame);
  });

  it("não captura F5 de usuário que recebeu negativa de autenticação", async () => {
    makeRealWorkspace();
    state.auth = { authResolved: true, isAuthenticated: false, authenticatedUserId: null };
    render(<SeamlessRefreshGate />);
    await act(async () => {
      expect(keyboard("F5").defaultPrevented).toBe(false);
    });
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("não captura F5 quando não existe interface protegida, inclusive antes do mount", async () => {
    state.auth = { authResolved: true, isAuthenticated: true, authenticatedUserId: "municipal-user-1" };
    render(<SeamlessRefreshGate />);
    await act(async () => {
      expect(keyboard("F5").defaultPrevented).toBe(false);
    });
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("não intercepta rotas públicas, documentos ou refresh forçado", async () => {
    makeRealWorkspace();
    state.auth = { authResolved: true, isAuthenticated: true, authenticatedUserId: "municipal-user-1" };
    const { rerender } = render(<SeamlessRefreshGate />);
    state.pathname = "/acesso";
    rerender(<SeamlessRefreshGate />);
    await act(async () => {
      expect(keyboard("F5").defaultPrevented).toBe(false);
    });
    state.pathname = "/processos/p1/documentos/doc1/visualizar";
    rerender(<SeamlessRefreshGate />);
    await act(async () => {
      expect(keyboard("F5").defaultPrevented).toBe(false);
    });
    state.pathname = "/prefeitura/arrecadacao";
    rerender(<SeamlessRefreshGate />);
    await act(async () => {
      expect(keyboard("F5", { shiftKey: true }).defaultPrevented).toBe(false);
    });
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("recusa sessão bloqueada e não confunde identidade visual cacheada com autorização", () => {
    const base = {
      authResolved: false,
      isAuthenticated: false,
      authenticatedUserId: null,
      sessionId: "municipal-user-1",
      role: "prefeitura_admin",
      accountStatus: "active",
      deleted: false,
      pathname: "/prefeitura/arrecadacao",
    };
    expect(canRefreshMountedWorkspace(base, true)).toBe(true);
    expect(canRefreshMountedWorkspace(base, false)).toBe(false);
    expect(canRefreshMountedWorkspace({ ...base, accountStatus: "blocked" }, true)).toBe(false);
    expect(canRefreshMountedWorkspace({ ...base, deleted: true }, true)).toBe(false);
    expect(canRefreshMountedWorkspace({ ...base, sessionId: "unknown" }, true)).toBe(false);
    expect(canRefreshMountedWorkspace({ ...base, authResolved: true }, true)).toBe(false);
    expect(canRefreshMountedWorkspace({ ...base, authResolved: true, isAuthenticated: true, authenticatedUserId: "municipal-user-1" }, true)).toBe(true);
  });
});
