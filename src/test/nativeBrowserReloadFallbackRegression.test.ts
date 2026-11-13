// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSeamlessInternalRefresh } from "@/lib/seamlessInternalRefresh";

const original = Object.getOwnPropertyDescriptor(window, "navigation");
afterEach(() => {
  if (original) Object.defineProperty(window, "navigation", original);
  else Reflect.deleteProperty(window, "navigation");
  vi.restoreAllMocks();
});

function install() {
  let navigate: ((e: Record<string, unknown>) => void) | undefined;
  Object.defineProperty(window, "navigation", {
    configurable: true,
    value: {
      addEventListener: vi.fn((_name: string, callback: (e: Record<string, unknown>) => void) => { navigate=callback; }),
      removeEventListener: vi.fn(),
    },
  });
  const refresh=vi.fn(async () => {});
  const cleanup=installSeamlessInternalRefresh({ isAuthenticated: () => true, refresh });
  return { refresh, cleanup, onNavigate: (e: Record<string, unknown>) => navigate!(e) };
}

function reloadNavigation(overrides: Record<string, unknown>={}) {
  const e = new Event("navigate", { cancelable: true }) as Event & Record<string, unknown>;
  Object.assign(e, {
    navigationType: "reload",
    canIntercept: false,
    userInitiated: true,
    destination: {url: window.location.href},
    ...overrides,
  });
  return e;
}

describe("F5/toolbar do Chrome — fallback seguro do Navigation API", () => {
  it("cancela reload cancelável da mesma rota, sem destruir documento", async () => {
    const test=install();
    const e=reloadNavigation();
    try {
      test.onNavigate(e);
      expect(e.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(test.refresh).toHaveBeenCalledTimes(1));
    } finally { test.cleanup(); }
  });

  it("respeita o navegador quando o evento de reload não pode ser cancelado", () => {
    const test=install();
    const e = reloadNavigation();
    Object.defineProperty(e, "cancelable", { value: false });
    try {
      test.onNavigate(e);
      expect(e.defaultPrevented).toBe(false);
      expect(test.refresh).not.toHaveBeenCalled();
    } finally { test.cleanup(); }
  });

  it("não intercepta navegação programática, troca de URL ou origem", () => {
    const test=install();
    try {
      for(const e of [
        reloadNavigation({userInitiated:false}),
        reloadNavigation({destination:{url:"https://other.example.com/dashboard"}}),
        reloadNavigation({destination:{url:window.location.href+"?other=1"}}),
        reloadNavigation({navigationType:"push"}),
      ]) {
        test.onNavigate(e);
        expect(e.defaultPrevented).toBe(false);
      }
      expect(test.refresh).not.toHaveBeenCalled();
    } finally { test.cleanup(); }
  });

  it("se intercept() lançar erro, tenta cancelamento somente quando permitido", async () => {
    const test=install();
    const e=reloadNavigation({canIntercept:true,intercept:()=>{throw new Error("unsupported");}});
    try {
      test.onNavigate(e);
      expect(e.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(test.refresh).toHaveBeenCalledTimes(1));
    } finally { test.cleanup(); }
  });
});
