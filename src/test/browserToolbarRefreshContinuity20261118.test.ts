// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSeamlessInternalRefresh } from "@/lib/seamlessInternalRefresh";

type NavigateMock = {
  navigationType: string;
  userInitiated: boolean;
  destination: { url: string };
  canIntercept: boolean;
  cancelable?: boolean;
  defaultPrevented?: boolean;
  preventDefault?: () => void;
  intercept: ReturnType<typeof vi.fn>;
};

function navigationHarness(isAuthenticated: () => boolean = () => true) {
  const listeners = new Map<string, (event: NavigateMock) => void>();
  Object.defineProperty(window, "navigation", {
    configurable: true,
    value: {
      addEventListener: (type: string, callback: (event: NavigateMock) => void) =>
        listeners.set(type, callback),
      removeEventListener: (type: string) => listeners.delete(type),
    },
  });
  const refresh = vi.fn().mockResolvedValue(undefined);
  const stop = installSeamlessInternalRefresh({ isAuthenticated, refresh });
  const navigate = (overrides: Partial<NavigateMock> = {}) => {
    let handler: (() => Promise<void>) | undefined;
    const event: NavigateMock = {
      navigationType: "reload",
      userInitiated: false,
      destination: { url: window.location.href },
      canIntercept: true,
      intercept: vi.fn(({ handler: accepted }: { handler: () => Promise<void> }) => {
        handler = accepted;
      }),
      ...overrides,
    };
    listeners.get("navigate")?.(event);
    return { event, handler };
  };
  return { navigate, refresh, stop };
}

afterEach(() => {
  Object.defineProperty(window, "navigation", { configurable: true, value: undefined });
});

describe("SIGAPRO — atualização do botão do navegador sem destruir interface", () => {
  it("aceita refresh de toolbar mesmo com userInitiated=false e preserva o DOM atual", async () => {
    const mounted = document.createElement("main");
    mounted.className = "sig-app-frame";
    document.body.append(mounted);
    const { navigate, refresh, stop } = navigationHarness();
    const { event, handler } = navigate({ userInitiated: false });
    expect(event.intercept).toHaveBeenCalledTimes(1);
    expect(handler).toBeTypeOf("function");
    await handler?.();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".sig-app-frame")).toBe(mounted);
    stop();
    mounted.remove();
  });

  it("não intercepta hard refresh (Shift+F5) nem inicia refresh em segundo plano", () => {
    const { navigate, refresh, stop } = navigationHarness();
    const key = new KeyboardEvent("keydown", { key: "F5", shiftKey: true, cancelable: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    const { event } = navigate({ userInitiated: true });
    expect(event.intercept).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    stop();
  });

  it("não intercepta outras rotas, logout ou documentos de URL diferente", () => {
    let authorized = true;
    const { navigate, refresh, stop } = navigationHarness(() => authorized);
    const changed = navigate({ destination: { url: new URL("/outra-rota", location.href).href } });
    expect(changed.event.intercept).not.toHaveBeenCalled();
    authorized = false;
    const denied = navigate({ userInitiated: true });
    expect(denied.event.intercept).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    stop();
  });

  it("não força uma interceptação em navegadores que negam canIntercept", () => {
    const { navigate, refresh, stop } = navigationHarness();
    const { event } = navigate({ canIntercept: false, cancelable: false });
    expect(event.intercept).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    stop();
  });

  it("mantém F5 comum como revalidação, sem disparar reload nativo", async () => {
    const { refresh, stop } = navigationHarness();
    const key = new KeyboardEvent("keydown", { key: "F5", cancelable: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    stop();
  });
});
