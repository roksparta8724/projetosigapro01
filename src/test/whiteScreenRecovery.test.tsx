import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SecureRoutePending } from "@/components/platform/SecureRoutePending";

describe("SIGAPRO — proteção contra tela branca", () => {
  it("não mostra tela intermediária no F5; o aviso é apenas de falha prolongada", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<SecureRoutePending title="Validando o acesso" detail="Verificando sua sessão." />);
      const pending = screen.getByRole("status");
      expect(pending).toHaveClass("sr-only");
      expect(pending).toHaveAttribute("data-sigapro-route-pending", "standard");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(container.querySelector("main")).toBeNull();
      expect(container.querySelector('[class*="min-h-screen"]')).toBeNull();
      act(() => vi.advanceTimersByTime(9001));
      expect(screen.getByRole("alert")).toHaveAttribute("data-sigapro-recovery-notice", "compact");
      expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ir para o acesso" })).toHaveAttribute("href", "/acesso");
    } finally {
      vi.useRealTimers();
    }
  });

  it("não volta a introduzir fallbacks silenciosos nos gates principais", () => {
    const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    const app = source("src/App.tsx");
    const permissionRoute = source("src/components/platform/PermissionRoute.tsx");
    const planRoute = source("src/components/platform/PlanModuleRoute.tsx");
    const html = source("index.html");
    const entry = source("src/main.tsx");

    expect(app).toContain("<Suspense fallback={<SecureRoutePending");
    expect(app).not.toContain("<Suspense fallback={null}>");
    expect(permissionRoute).toContain('"Validando o acesso municipal"');
    expect(planRoute).toContain('title="Conferindo o módulo contratado"');
    expect(html).toContain('id="sigapro-preboot-recovery"');
    expect(html).toContain('}, 15000);');
    expect(html).toContain('inset: auto 16px 16px auto;');
    expect(html).not.toContain('inset: 0;\n        z-index: 99999;');
    expect(html).not.toContain('blocking="render"');
    const failurePath = entry.slice(
      entry.indexOf("function renderBootstrapFailure"),
      entry.indexOf("function scheduleLocalCacheMaintenance"),
    );
    expect(failurePath).toContain('document.documentElement.removeAttribute("data-sigapro-initial-render")');
    expect(failurePath).toContain('document.getElementById("sigapro-preboot-recovery")?.remove()');
  });
});
