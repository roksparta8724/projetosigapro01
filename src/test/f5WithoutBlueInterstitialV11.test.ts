// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSeamlessInternalRefresh } from "@/lib/seamlessInternalRefresh";

afterEach(() => {
  Reflect.deleteProperty(window, "navigation");
});

describe("SIGAPRO — F5 sem shell de substituição", () => {
  it("mantém o DOM autenticado no F5 e Ctrl+R, atualizando apenas dados oficiais", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const off = installSeamlessInternalRefresh({ isAuthenticated: () => true, refresh });
    try {
      const f5 = new KeyboardEvent("keydown", { key: "F5", bubbles: true, cancelable: true });
      window.dispatchEvent(f5);
      expect(f5.defaultPrevented).toBe(true);
      expect(refresh).toHaveBeenCalledTimes(1);

      const ctrl = new KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(ctrl);
      expect(ctrl.defaultPrevented).toBe(true);
      // Uma recarga já em andamento não deve duplicar solicitações simultâneas.
      expect(refresh).toHaveBeenCalledTimes(1);

      const forced = new KeyboardEvent("keydown", { key: "F5", shiftKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(forced);
      expect(forced.defaultPrevented).toBe(false);
    } finally {
      off();
    }
  });

  it("não intercepta atualizações quando a conta não foi autenticada", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const off = installSeamlessInternalRefresh({ isAuthenticated: () => false, refresh });
    try {
      const f5 = new KeyboardEvent("keydown", { key: "F5", bubbles: true, cancelable: true });
      window.dispatchEvent(f5);
      expect(f5.defaultPrevented).toBe(false);
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });

  it("intercepta recarga pelo botão do navegador quando Navigation API autorizar", async () => {
    let navigateListener: ((event: unknown) => void) | null = null;
    Object.defineProperty(window, "navigation", {
      configurable: true,
      value: {
        addEventListener: vi.fn((_name: string, cb: (event: unknown) => void) => { navigateListener = cb; }),
        removeEventListener: vi.fn(),
      },
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const off = installSeamlessInternalRefresh({ isAuthenticated: () => true, refresh });
    try {
      const intercept = vi.fn();
      const event = {
        navigationType: "reload",
        canIntercept: true,
        userInitiated: true,
        destination: { url: window.location.href },
        intercept,
      };
      expect(navigateListener).not.toBeNull();
      navigateListener!(event);
      expect(intercept).toHaveBeenCalledTimes(1);
      const config = intercept.mock.calls[0][0] as { handler: () => Promise<void>; focusReset: string; scroll: string };
      expect(config.focusReset).toBe("manual");
      expect(config.scroll).toBe("manual");
      await config.handler();
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it("não renderiza fundo azul forçado, shell, snapshot DOM ou tela intermediária", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const pending = readFileSync(resolve(process.cwd(), "src/components/platform/SecureRoutePending.tsx"), "utf8");
    const entry = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(html).toContain('data-sigapro-boot-slow');
    expect(html).toContain("}, 15000);");
    expect(html).toContain("display: none;");
    expect(html).not.toContain("inset: 0;");
    expect(html).not.toContain("background-color: #153a52 !important");
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(pending).toContain('className="sr-only"');
    expect(pending).toContain('data-sigapro-route-pending={surface}');
    expect(pending).not.toContain("min-h-screen");
    expect(entry).toContain("new MutationObserver(finishBootstrap)");
    expect(app).toContain("<SeamlessRefreshGate />");
  });
});
