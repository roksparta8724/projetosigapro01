import { describe, expect, it, vi, afterEach } from "vitest";
import { installSeamlessInternalRefresh } from "@/lib/seamlessInternalRefresh";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const navigationOriginal = Object.getOwnPropertyDescriptor(window, "navigation");
afterEach(() => {
  if (navigationOriginal) Object.defineProperty(window, "navigation", navigationOriginal);
  else Reflect.deleteProperty(window, "navigation");
  vi.restoreAllMocks();
});

describe("SIGAPRO V9: browser refresh without blank document", () => {
  it("F5 updates official data without unloading, changing route or inserting a shell", async () => {
    Object.defineProperty(window, "navigation", { value: undefined, configurable: true });
    const refresh = vi.fn(async () => undefined);
    const cleanup = installSeamlessInternalRefresh({ isAuthenticated: () => true, refresh });
    try {
      const pathname = window.location.href;
      const event = new KeyboardEvent("keydown", { key: "F5", cancelable: true, bubbles: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(window.location.href).toBe(pathname);
    } finally { cleanup(); }
  });

  it("browser reload button is intercepted by Navigation API only on same origin/path", async () => {
    let listener: ((event: Record<string, unknown>) => void) | undefined;
    const navigation = {
      addEventListener: vi.fn((_type: string, callback: (event: Record<string, unknown>) => void) => { listener = callback; }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "navigation", { value: navigation, configurable: true });
    const refresh = vi.fn(async () => undefined);
    const cleanup = installSeamlessInternalRefresh({ isAuthenticated: () => true, refresh });
    try {
      const intercept = vi.fn();
      listener?.({
        navigationType: "reload",
        canIntercept: true,
        userInitiated: true,
        destination: { url: window.location.href },
        intercept,
      });
      expect(intercept).toHaveBeenCalledTimes(1);
      const handler = intercept.mock.calls[0][0].handler as () => Promise<void>;
      expect(intercept.mock.calls[0][0]).toEqual({
        focusReset: "manual", scroll: "manual", handler,
      });
      await handler();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(navigation.removeEventListener).not.toHaveBeenCalled();
    } finally {
      cleanup();
      expect(navigation.removeEventListener).toHaveBeenCalledTimes(1);
    }
  });

  it("never intercepts forced reloads, navigation away, programmatic reload or unauthorized sessions", async () => {
    let listener: ((event: Record<string, unknown>) => void) | undefined;
    Object.defineProperty(window, "navigation", {
      value: { addEventListener: (_: string, cb: typeof listener) => { listener = cb; }, removeEventListener: () => {} },
      configurable: true,
    });
    let authorized = true;
    const refresh = vi.fn(async () => undefined);
    const cleanup = installSeamlessInternalRefresh({ isAuthenticated: () => authorized, refresh });
    try {
      const intercept = vi.fn();
      for (const fields of [
        { userInitiated: false, destination: { url: window.location.href }, canIntercept: true },
        { userInitiated: true, destination: { url: window.location.href + "?different" }, canIntercept: true },
        { userInitiated: true, destination: { url: window.location.href }, canIntercept: false },
      ]) listener?.({ navigationType: "reload", intercept, ...fields });
      authorized = false;
      listener?.({
        navigationType: "reload", userInitiated: true,
        destination: { url: window.location.href }, canIntercept: true, intercept,
      });
      expect(intercept).not.toHaveBeenCalled();
      for (const init of [
        { key: "F5", shiftKey: true },
        { key: "r", ctrlKey: true, shiftKey: true },
      ]) {
        const e = new KeyboardEvent("keydown", { cancelable: true, bubbles: true, ...init });
        window.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(false);
      }
      expect(refresh).not.toHaveBeenCalled();
    } finally { cleanup(); }
  });

  it("does not intercept document-viewing routes or reveal data from cache", () => {
    const code = source("src/lib/seamlessInternalRefresh.ts");
    const frame = source("src/components/platform/PortalFrame.tsx");
    expect(code).toContain("documentos");
    expect(code).toContain("(visualizar|analisar)$");
    expect(code).toContain('event.navigationType !== "reload"');
    expect(code).toContain('event.userInitiated === false');
    expect(frame).toContain("installSeamlessInternalRefresh({");
    expect(frame).toContain('session.id === "unknown"');
    expect(code).not.toContain("sessionStorage");
    expect(code).not.toContain("innerHTML");
    expect(code).not.toContain("setTimeout");
  });
});
