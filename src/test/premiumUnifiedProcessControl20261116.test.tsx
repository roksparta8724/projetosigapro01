// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CompactProcessRegistry } from "@/components/platform/CompactProcessRegistry";
import type { ProcessRecord } from "@/lib/platform";

const process = {
  id: "process-123",
  tenantId: "municipalidade-123",
  protocol: "PM-2026-00123",
  title: "Licenciamento Urbanístico",
  type: "licenciamento",
  status: "analise_tecnica",
  ownerName: "Pessoa de teste",
  technicalLead: "Analista autorizado",
  tags: ["Prioridade::orange", "Vistoria::blue"],
  requirements: [{ id: "exigencia", status: "aberta", title: "Documento", visibility: "interno" }],
  dispatches: [],
  timeline: [],
  analysis: null,
  sla: { currentStage: "Análise Urbanística", dueDate: "22/12/2026", hoursRemaining: 8, breached: false },
  payment: { status: "pendente", guideNumber: "DAM-2026-001", guides: [] },
} as unknown as ProcessRecord;

const source = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO — controle premium real e consistente para todos os processos", () => {
  it("mantém o mesmo componente de processos no município, dashboard, triagem, análise, finanças e externo", () => {
    for (const path of [
      "src/pages/saas/TenantAdminPage.tsx",
      "src/pages/saas/MunicipalProcessRegistryPage.tsx",
      "src/pages/saas/DashboardHomePage.tsx",
      "src/pages/saas/ProtocolDeskPage.tsx",
      "src/pages/saas/AnalystDeskPage.tsx",
      "src/pages/saas/FinanceProtocolsPage.tsx",
      "src/pages/saas/ExternalProcessControlPage.tsx",
    ]) {
      expect(source(path), path).toContain("<CompactProcessRegistry");
    }
    const tenant = source("src/pages/saas/TenantAdminPage.tsx");
    expect(tenant).not.toContain("renderQueueCard");
    expect(tenant).toContain("renderQueueTable(filteredQueue)");
  });

  it("exibe uma linha completa por processo, com marcadores, prazo, pendências e link oficial", () => {
    const { container } = render(<MemoryRouter><CompactProcessRegistry processes={[process]} showArchiveAction={false} /></MemoryRouter>);
    expect(container.querySelectorAll('[data-sei-process-row="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-sigapro-process-control="premium-table"]')).toBeTruthy();
    expect(screen.getByText("Licenciamento Urbanístico")).toBeInTheDocument();
    expect(screen.getByText("22/12/2026")).toBeInTheDocument();
    expect(screen.getByText("1 exig.")).toBeInTheDocument();
    expect(screen.getByText("1 guia(s)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir processo/ })).toHaveAttribute("href");
    expect(container.querySelector('[title="Prioridade"]')).toBeTruthy();
  });

  it("permite selecionar a própria linha sem executar decisões oficiais", () => {
    const callback = vi.fn();
    render(<MemoryRouter>
      <CompactProcessRegistry processes={[process]} selectedProcessIds={[]}
        onToggleSelection={callback} canDispatchProcess={() => false} />
    </MemoryRouter>);
    fireEvent.click(screen.getByRole("checkbox", { name: /Selecionar processo Processo/ }));
    expect(callback).toHaveBeenCalledWith("process-123", true);
    expect(screen.queryByText("Despachar")).toBeNull();
  });

  it("não mostra exigência interna, responsável de setor ou guia não validada para externo", () => {
    const { container } = render(<MemoryRouter>
      <CompactProcessRegistry processes={[process]} showSensitiveDetails={false} />
    </MemoryRouter>);
    expect(screen.getByText("Acompanhamento externo")).toBeInTheDocument();
    expect(screen.queryByText("Pessoa de teste")).toBeNull();
    expect(screen.queryByText("Analista autorizado")).toBeNull();
    expect(screen.queryByText("1 exig.")).toBeNull();
    expect(screen.queryByText("1 guia(s)")).toBeNull();
    expect(container.querySelector('[data-sei-process-row]')).toBeTruthy();
  });

  it("não apresenta a versão detalhada como ação fictícia: ela permanece acessível em cada mesa", () => {
    expect(source("src/pages/saas/ProtocolDeskPage.tsx")).toContain("Ver ações de triagem");
    expect(source("src/pages/saas/AnalystDeskPage.tsx")).toContain("Ver ações detalhadas da Análise");
    expect(source("src/pages/saas/FinanceProtocolsPage.tsx")).toContain("Ver guias e ações financeiras");
    expect(source("src/pages/saas/ExternalProcessControlPage.tsx")).toContain("Ver pagamentos e detalhes");
  });
});
