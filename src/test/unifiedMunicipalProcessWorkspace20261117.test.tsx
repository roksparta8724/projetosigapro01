// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PremiumProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import type { ProcessRecord } from "@/lib/platform";

const record = {
  id: "4b3a5131-0d46-48e6-bdc3-32a2276254c5",
  municipalityId: "municipal-qa",
  tenantId: "municipal-qa",
  isOfficial: true,
  protocol: "PM-2026-00001",
  title: "Licenciamento Urbanístico",
  ownerName: "Interessado QA",
  technicalLead: "Servidor QA",
  status: "analise_tecnica",
  type: "aprovacao",
  tags: [],
  requirements: [],
  dispatches: [],
  timeline: [],
  analysis: { assignedTo: "Servidor QA" },
  sla: { currentStage: "Análise Urbanística", dueDate: "", breached: false, hoursRemaining: 50 },
  payment: { guideNumber: "", status: "pendente", guides: [] },
} as unknown as ProcessRecord;

describe("Layout único premium das filas municipais", () => {
  it("não duplica painel, cabeçalho ou pesquisa dentro da pasta da Análise", () => {
    const { container } = render(
      <MemoryRouter>
        <PremiumProcessRegistry processes={[record]} operatorName="Servidor QA"
          embedded hideSearchInput />
      </MemoryRouter>
    );
    const workspace = container.querySelector('[data-workspace-density="embedded"]');
    expect(workspace).not.toBeNull();
    expect(workspace?.querySelector(".sig-workspace-breadcrumb")).toBeNull();
    expect(workspace?.querySelector(".sig-workspace-hero")).toBeNull();
    expect(workspace?.querySelector(".sig-workspace-kpis")).toBeNull();
    expect(workspace?.querySelector(".sig-workspace-search")).toBeNull();
    expect(screen.getByRole("group", { name: "Filtros rápidos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excel" })).toBeEnabled();
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(1);
    expect(screen.getByText("Licenciamento Urbanístico")).toBeInTheDocument();
  });

  it("mantém a seleção, ações e filtros na apresentação compacta", () => {
    const { container } = render(
      <MemoryRouter>
        <PremiumProcessRegistry processes={[record]} embedded hideSearchInput />
      </MemoryRouter>
    );
    const button = screen.getByRole("button", { name: "Encaminhar" });
    expect(button).toBeDisabled();
    const checkbox = container.querySelector<HTMLInputElement>(
      '[data-sei-process-row="true"] input[type="checkbox"]'
    );
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox!);
    expect(button).toBeEnabled();
    expect(screen.getByText("1 selecionado(s)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Análise" }));
    expect(screen.getByRole("button", { name: "Análise" })).toHaveAttribute("aria-pressed", "true");
  });

  it("preserva o cabeçalho completo na gestão municipal principal", () => {
    const { container } = render(
      <MemoryRouter><PremiumProcessRegistry processes={[record]} /></MemoryRouter>
    );
    const workspace = container.querySelector('[data-workspace-density="standalone"]');
    expect(workspace).not.toBeNull();
    expect(workspace?.querySelector(".sig-workspace-hero")).not.toBeNull();
    expect(workspace?.querySelectorAll(".sig-workspace-kpi")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Controle de Processos" })).toBeInTheDocument();
  });
});
