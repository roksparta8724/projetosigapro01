import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("municipal process registry", () => {
  const registry = readFileSync(
    resolve(process.cwd(), "src/components/platform/CompactProcessRegistry.tsx"),
    "utf8",
  );
  const page = readFileSync(
    resolve(process.cwd(), "src/pages/saas/MunicipalProcessRegistryPage.tsx"),
    "utf8",
  );
  const analyst = readFileSync(
    resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"),
    "utf8",
  );
  const frame = readFileSync(
    resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"),
    "utf8",
  );
  const platform = readFileSync(resolve(process.cwd(), "src/lib/platform.ts"), "utf8");

  it("keeps the process list compact and linked to the existing process detail", () => {
    expect(registry).toContain("CompactProcessRegistry");
    expect(registry).toContain("buildProcessPath(process)");
    expect(registry).not.toContain('/processos/${process.id}');
    expect(registry).toContain("Despachar");
    expect(registry).toContain("Ver histórico");
    expect(registry).toContain("Arquivar da minha lista");
    expect(registry).toContain("parseMarker");
  });

  it("keeps the municipality-wide registry dense but restores premium process cards in the analysis tab", () => {
    expect(registry).toContain('data-sei-process-row="true"');
    expect(registry).toContain("px-3 py-2.5");
    expect(registry).not.toContain("Abrir processo");
    expect(analyst).not.toContain("CompactProcessRegistry");
    expect(analyst).toContain('data-process-premium-card="true"');
    expect(analyst).toContain("Abrir processo");
    expect(analyst).toContain("sm:w-[190px]");
  });

  it("shows only the single operational marker and leaves marker management in the topbar", () => {
    expect(registry).toContain("process.tags?.[0]");
    expect(registry).not.toContain("MarkerSelector");
    expect(analyst).not.toContain("CompactProcessRegistry");
    expect(analyst).toContain("O número sublinhado");
    expect(analyst).toContain("Abrir processo");
  });

  it("moves the organogram to the topbar instead of rendering the page organogram strip", () => {
    expect(frame).toContain('navigate("/prefeitura/organograma")');
    expect(frame).toContain('aria-label="Organograma municipal"');
    expect(frame).toContain("showMunicipalOrganogramShortcut");
    expect(frame).toContain("Organograma municipal");
    expect(frame).not.toContain(">Organograma<");
    expect(frame).not.toContain("MunicipalOrganogramBar");
    expect(frame).not.toContain('key: "organization"');
  });

  it("provides one municipality-wide registry for internal municipal users", () => {
    expect(page).toContain("Processos da Prefeitura");
    expect(page).toContain("matchesOperationalScope");
    expect(page).toContain("isInternalRole");
    expect(frame).toContain('"/prefeitura/processos"');
    expect(platform).toContain("Leitura/acompanhamento municipal é transversal");
    expect(platform).toContain("return true;");
  });

  it("does not broaden departmental dispatch authority", () => {
    expect(page).toContain("isProcessOwnedBySessionDepartment");
    expect(page).toContain("canDispatchProcess");
    expect(analyst).toContain("setProcessArchived");
  });
});
