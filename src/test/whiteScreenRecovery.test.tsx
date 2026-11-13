import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecureRoutePending } from "@/components/platform/SecureRoutePending";

afterEach(() => {
  vi.useRealTimers();
});

describe("SIGAPRO — recuperação sem shell de carregamento", () => {
  it("não desenha overlay ou página falsa durante autenticação e carregamento normal", () => {
    vi.useFakeTimers();
    const { container } = render(<SecureRoutePending title="Validando o acesso" detail="Verificando sua sessão." />);
    expect(screen.getByRole("status")).toHaveTextContent("Validando o acesso");
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector('[data-sigapro-recovery-notice]')).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(11999));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para o acesso" })).toHaveAttribute("href", "/acesso");
  });

  it("mantém as portas de autorização sem renderizar rotas protegidas prematuramente", () => {
    const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    const app = source("src/App.tsx");
    const permissionRoute = source("src/components/platform/PermissionRoute.tsx");
    const planRoute = source("src/components/platform/PlanModuleRoute.tsx");
    const html = source("index.html");
    const entry = source("src/main.tsx");

    expect(app).toContain("<Suspense fallback={<SecureRoutePending");
    expect(app).toContain("<SeamlessRefreshGate />");
    expect(permissionRoute).toContain('"Validando o acesso municipal"');
    expect(planRoute).toContain('title="Conferindo o módulo contratado"');
    expect(html).toContain('id="sigapro-preboot-recovery"');
    expect(html).toContain('data-sigapro-boot-slow');
    expect(html).not.toContain("inset: 0;");
    expect(html).not.toContain('background-color: #153a52 !important');
    expect(html).not.toContain('blocking="render"');
    const failurePath = entry.slice(
      entry.indexOf("function renderBootstrapFailure"),
      entry.indexOf("function scheduleLocalCacheMaintenance"),
    );
    expect(failurePath).toContain('document.documentElement.removeAttribute("data-sigapro-initial-render")');
    expect(failurePath).toContain('document.getElementById("sigapro-preboot-recovery")?.remove()');
    expect(entry).toContain("new MutationObserver(finishBootstrap)");
    expect(entry).toContain("if (!rootElement.hasChildNodes()) return;");
  });
});
