// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { resolveTopbarProcessDestination } from "@/lib/topbarProcessDestination";

const portal = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
const contrast = readFileSync("src/styles/sigapro-active-filter-contrast.css", "utf8");
const registry = readFileSync("src/components/platform/PremiumProcessRegistry.tsx", "utf8");
const routes = readFileSync("src/App.tsx", "utf8");

function TestShortcut({ role }: { role: string }) {
  const loc = useLocation();
  return <>
    <Link aria-label="Processos" to={resolveTopbarProcessDestination(role)}>Processos</Link>
    <output data-testid="location">{loc.pathname}</output>
  </>;
}
const rolePaths: Array<[string, string]> = [
  ["master_admin", "/dashboard/processos"],
  ["master_ops", "/dashboard/processos"],
  ["prefeitura_admin", "/prefeitura/processos"],
  ["prefeitura_supervisor", "/prefeitura/processos"],
  ["analista", "/prefeitura/processos"],
  ["financeiro", "/prefeitura/processos"],
  ["setor_intersetorial", "/prefeitura/processos"],
  ["fiscal", "/prefeitura/processos"],
  ["profissional_externo", "/externo/controle"],
  ["proprietario_consulta", "/proprietario"],
  ["property_owner", "/proprietario"],
];

describe("SIGAPRO — topbar Processos e contraste do filtro ativo", () => {
  it.each(rolePaths)("resolve a pasta real de processos para o perfil %s", (role, path) => {
    expect(resolveTopbarProcessDestination(role)).toBe(path);
  });

  it.each(rolePaths)("abre a rota correta ao clicar em Processos para %s", (role, path) => {
    render(
      <MemoryRouter initialEntries={["/prefeitura/protocolos"]}>
        <Routes>
          <Route path="*" element={<TestShortcut role={role} />} />
        </Routes>
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: "Processos" });
    expect(link).toHaveAttribute("href", path);
    fireEvent.click(link);
    expect(screen.getByTestId("location")).toHaveTextContent(path);
  });

  it("usa Link e o mesmo destino por perfil em desktop e celular, sem handlers divergentes", () => {
    expect(portal).toContain("resolveTopbarProcessDestination(session.role)");
    expect(portal).toContain('data-topbar-process-shortcut="mobile"');
    expect(portal).toContain('data-topbar-process-shortcut="desktop"');
    expect(portal.match(/<Link\s+to=\{processShortcutPath\}/g)).toHaveLength(2);
    expect(portal).not.toContain("navigate(processShortcutPath)");
    expect(routes).toContain('path="/dashboard/*"');
    expect(routes).toContain('path="/prefeitura/processos"');
    expect(routes).toContain('path="/externo/controle"');
    expect(routes).toContain('path="/proprietario"');
  });

  it("troca para branco o texto, os filhos e o ícone dos filtros escuros selecionados", () => {
    expect(contrast).toContain(".sig-workspace-chip.is-active:not(:disabled)");
    expect(contrast).toContain('.sig-workspace-chip[aria-pressed="true"]:not(:disabled)');
    expect(contrast).toContain("-webkit-text-fill-color: #ffffff !important");
    expect(contrast).toContain("stroke: currentColor !important");
    expect(contrast).toContain(".sig-workspace-chip.is-active:not(:disabled):hover");
    expect(contrast).toContain(".sig-workspace-chip.is-active:not(:disabled):focus-visible");
    expect(registry).toContain('import "@/styles/sigapro-active-filter-contrast.css"');
  });
});
