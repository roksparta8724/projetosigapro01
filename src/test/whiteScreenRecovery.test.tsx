import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SecureRoutePending } from "@/components/platform/SecureRoutePending";

describe("SIGAPRO — proteção contra tela branca", () => {
  it("mostra estado legível com duas opções de recuperação em vez de root vazio", () => {
    render(<SecureRoutePending title="Validando o acesso" detail="Verificando sua sessão." />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Validando o acesso" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao acesso" })).toHaveAttribute("href", "/acesso");
    expect(screen.getByText("Verificando sua sessão.")).toBeInTheDocument();
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
    expect(html).not.toContain('blocking="render"');
    const failurePath = entry.slice(
      entry.indexOf("function renderBootstrapFailure"),
      entry.indexOf("function scheduleLocalCacheMaintenance"),
    );
    expect(failurePath).toContain('document.documentElement.removeAttribute("data-sigapro-initial-render")');
    expect(failurePath).toContain('document.getElementById("sigapro-preboot-recovery")?.remove()');
  });
});
