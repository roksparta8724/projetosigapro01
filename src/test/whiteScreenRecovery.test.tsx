import { readFileSync } from "node:fs";
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
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const permissionRoute = readFileSync(
      new URL("../components/platform/PermissionRoute.tsx", import.meta.url), "utf8",
    );
    const planRoute = readFileSync(
      new URL("../components/platform/PlanModuleRoute.tsx", import.meta.url), "utf8",
    );
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

    expect(app).toContain("<Suspense fallback={<SecureRoutePending");
    expect(app).not.toContain("<Suspense fallback={null}>");
    expect(permissionRoute).toContain('"Validando o acesso municipal"');
    expect(planRoute).toContain('title="Conferindo o módulo contratado"');
    expect(html).toContain('id="sigapro-preboot-recovery"');
    expect(html).not.toContain('blocking="render"');
  });
});
