// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MunicipalProcessRegistryPage } from "@/pages/saas/MunicipalProcessRegistryPage";

const state = vi.hoisted(() => ({
  role: "prefeitura_admin",
  markerWrite: vi.fn().mockResolvedValue(undefined),
  assign: vi.fn().mockResolvedValue(undefined),
  dispatch: vi.fn().mockResolvedValue(undefined),
  listUnits: vi.fn().mockRejectedValue(new Error("Unidade não instalada na homologação")),
  setUnit: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn().mockResolvedValue(undefined),
}));
const process = {
  id: "e1d319ac-09f9-4b88-b86d-a9436eab0808",
  tenantId: "municipal-qa", municipalityId: "municipal-qa", isOfficial: true,
  protocol: "PM-2026-00001", title: "Licenciamento Urbanístico",
  status: "analise_tecnica", type: "aprovacao", ownerName: "Cliente Teste",
  technicalLead: "Ana Técnica", createdAt: "2026-11-17T12:00:00.000Z",
  processControl: { currentFolder: "Análise Urbanística" },
  analysis: { assignedTo: "Ana Técnica" }, tags: [],
  requirements: [], dispatches: [], timeline: [],
  triage: { status: "concluido" },
  payment: { guideNumber: "", status: "pendente", guides: [] },
  sla: { currentStage: "Análise Urbanística", breached: false, hoursRemaining: 36, dueDate: "" },
};

vi.mock("@/hooks/usePlatformSession", () => ({
  usePlatformSession: () => ({ session: {
    id: "account-qa", name: "Ana Técnica", role: state.role,
    accountStatus: "active", department: "Análise Urbanística", title: "Técnica",
    municipalityId: "municipal-qa", tenantId: "municipal-qa",
  } }),
}));
vi.mock("@/hooks/useMunicipality", () => ({
  useMunicipality: () => ({ municipality: { id: "municipal-qa", name: "Prefeitura QA" }, scopeId: "municipal-qa" }),
}));
vi.mock("@/hooks/usePlatformData", () => ({
  usePlatformData: () => ({
    processes: [process], remoteSyncedForCurrentUser: true,
    dataError: null, loading: false, refreshRemoteStore: state.refresh,
    addProcessMarkerWithColor: state.markerWrite,
    removeProcessMarker: vi.fn().mockResolvedValue(undefined),
    sessionUsers: [], assignProcessAnalysis: state.assign,
    reassignProcessAnalysis: state.assign, dispatchProcess: state.dispatch,
  }),
}));
vi.mock("@/hooks/useMarkerPresets", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useMarkerPresets")>();
  return {
    ...real,
    useMarkerPresets: () => ({ presets: [
      { id: "tag1", label: "Retorno", colorId: "red", color: "#dc2626", emoji: "", active: true },
    ], addPreset: vi.fn() }),
  };
});
vi.mock("@/hooks/useMunicipalOrganogram", () => ({
  useMunicipalOrganogram: () => ({ departments: [
    { id: "department1", name: "Análise Urbanística", isActive: true },
    { id: "department2", name: "Financeiro", isActive: true },
  ] }),
}));
vi.mock("@/hooks/useLivePlatformRefresh", () => ({
  useLivePlatformRefresh: () => undefined,
}));
vi.mock("@/integrations/backend/processUnitCompletionClient", () => ({
  listMyUnitProcessCompletions: state.listUnits,
  setMyUnitProcessCompletion: state.setUnit,
}));
vi.mock("@/components/platform/PortalFrame", () => ({
  PortalFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/platform/PageShell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function renderAndSelect() {
  const result = render(<MemoryRouter><MunicipalProcessRegistryPage /></MemoryRouter>);
  const row = result.container.querySelector<HTMLInputElement>(
    '[data-sei-process-row="true"] input[type="checkbox"]'
  );
  expect(row).not.toBeNull();
  fireEvent.click(row!);
  expect(screen.getByText("1 selecionado(s)")).toBeInTheDocument();
  return result;
}
function actionButton(name: string) {
  return screen.getByRole("button", { name: new RegExp("^" + name, "i") });
}
describe("SIGAPRO — integração REAL da barra ao Controle de Processos", () => {
  beforeEach(() => {
    state.role = "prefeitura_admin";
    state.markerWrite.mockClear();
    state.assign.mockClear();
    state.dispatch.mockClear();
    state.setUnit.mockClear();
    state.refresh.mockClear();
    state.listUnits.mockReset().mockRejectedValue(new Error("Conexão indisponível no perfil de consulta"));
    state.setUnit.mockReset().mockResolvedValue({
      process_id: process.id, status: "concluido", unit_name: "Análise Urbanística",
      updated_at: "2026-11-17T15:00:00.000Z",
    });
  });

  it("em conta somente consulta, cada ação abre diálogo e explica permissão; não grava atos", () => {
    renderAndSelect();
    expect(screen.getByText(/Perfil atual em modo consulta:/)).toBeInTheDocument();
    for (const [label, title] of [
      ["Prioridade", "Definir prioridade de acompanhamento"],
      ["Atribuir", "Atribuir análise técnica"],
      ["Encaminhar", "Encaminhar entre unidades"],
      ["Etiquetas", "Gerenciar marcadores pessoais"],
    ]) {
      const button = actionButton(label);
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Confirmar operação" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    }
    fireEvent.click(actionButton("Decisão"));
    expect(screen.getByRole("heading", { name: "Abrir decisão oficial" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir ficha/i })).toBeInTheDocument();
    expect(state.markerWrite).not.toHaveBeenCalled();
    expect(state.assign).not.toHaveBeenCalled();
    expect(state.dispatch).not.toHaveBeenCalled();
  });

  it("não oferece conclusão local a perfil somente consulta ou sem RPC oficial pronto", async () => {
    renderAndSelect();
    const button = actionButton("Concluir nesta unidade");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-unit-candidate", "check-permissions");
    expect(screen.getByText(/Perfil atual em modo consulta:/)).toBeInTheDocument();
    expect(state.setUnit).not.toHaveBeenCalled();
  });


  it("encaminha processo de um analista e oferece concluir APENAS na unidade de origem", async () => {
    state.role = "analista";
    state.listUnits.mockResolvedValue([]);
    renderAndSelect();
    await waitFor(() => expect(state.listUnits).toHaveBeenCalled());
    fireEvent.click(actionButton("Encaminhar"));
    expect(screen.getByRole("heading", { name: "Encaminhar entre unidades" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Unidade de destino"), {
      target: { value: "Financeiro" },
    });
    fireEvent.change(screen.getByLabelText("Prazo da tramitação"), {
      target: { value: "2026-11-25" },
    });
    fireEvent.change(screen.getByLabelText("Assunto / motivação do encaminhamento"), {
      target: { value: "Conferência financeira do processo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar operação" }));
    await waitFor(() => expect(state.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      processId: process.id, from: "Análise Urbanística",
      to: "Financeiro", subject: "Conferência financeira do processo",
    })));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Concluir nesta unidade" })).toBeInTheDocument());
    expect(screen.getByText(/não encerra o processo municipal/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar conclusão na unidade" }));
    await waitFor(() => expect(state.setUnit).toHaveBeenCalledWith(process.id, true));
  });

  it("reabre atendimento apenas na unidade, sem alterar o status geral", async () => {
    state.role = "analista";
    state.listUnits.mockResolvedValue([{
      process_id: process.id, status: "concluido",
      unit_name: "Análise Urbanística", updated_at: "2026-11-17T15:00:00.000Z",
    }]);
    renderAndSelect();
    await waitFor(() => expect(screen.getByRole("button", { name: "Reabrir na unidade" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Reabrir na unidade" }));
    expect(screen.getByRole("heading", { name: "Reabrir nesta unidade" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reabertura" }));
    await waitFor(() => expect(state.setUnit).toHaveBeenCalledWith(process.id, false));
  });

  it("um analista autorizado abre prioridade e grava no serviço oficial", async () => {
    state.role = "analista";
    renderAndSelect();
    fireEvent.click(actionButton("Prioridade"));
    expect(screen.getByRole("heading", { name: "Definir prioridade de acompanhamento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar operação" }));
    await waitFor(() => expect(state.markerWrite).toHaveBeenCalledTimes(1));
    expect(state.markerWrite).toHaveBeenCalledWith(
      process.id, "Prioridade operacional", "#ca8a04", "Ana Técnica"
    );
  });
});
