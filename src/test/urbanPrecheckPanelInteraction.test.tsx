// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const calls = vi.hoisted(() => ({
  history: vi.fn(), regulations: vi.fn(), evidence: vi.fn(), save: vi.fn(),
}));
vi.mock("@/integrations/backend/urbanPrecheckClient", () => ({
  listUrbanPrecheckHistory: calls.history,
  listUrbanRegulations: calls.regulations,
  saveUrbanPrecheckRun: calls.save,
}));
vi.mock("@/integrations/backend/urbanLegalEvidenceClient", () => ({
  listUrbanLegalEvidence: calls.evidence,
}));
vi.mock("@/components/platform/UrbanDocumentEvidenceDesk", () => ({
  UrbanDocumentEvidenceDesk: () => null,
}));
vi.mock("@/components/platform/UrbanLegalKnowledgeDesk", () => ({
  UrbanLegalKnowledgeDesk: () => null,
}));

import { UrbanPrecheckPanel } from "@/components/platform/UrbanPrecheckPanel";
import type { ProcessRecord } from "@/lib/platform";

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
}
function process(id: string): ProcessRecord {
  return { id, protocol: "QA-" + id, property: { usage: "RESIDENCIAL" } } as ProcessRecord;
}

describe("SIGAPRO IA — histórico React com respostas concorrentes", () => {
  beforeEach(() => {
    calls.history.mockReset();
    calls.regulations.mockReset().mockResolvedValue([]);
    calls.evidence.mockReset().mockResolvedValue([]);
    calls.save.mockReset();
  });
  afterEach(() => cleanup());

  it("não apresenta histórico vazio enquanto a leitura está pendente", async () => {
    const request = pending<never[]>();
    calls.history.mockReturnValueOnce(request.promise);
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    expect(screen.getByText(/Consultando histórico de pré-conferências/)).toBeTruthy();
    expect(screen.queryByText("Nenhuma pré-conferência registrada.")).toBeNull();
    await act(async () => { request.resolve([]); });
    expect(await screen.findByText("Nenhuma pré-conferência registrada.")).toBeTruthy();
  });

  it("não deixa resposta de outro processo substituir o histórico atual", async () => {
    const old = pending<never[]>();
    const current = pending<never[]>();
    calls.history.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { rerender } = render(
      <UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />,
    );
    rerender(<UrbanPrecheckPanel process={process("B")} municipalityId="prefeitura-A" readOnly />);
    await waitFor(() => expect(calls.history).toHaveBeenCalledTimes(2));
    await act(async () => { old.resolve([]); });
    expect(screen.queryByText("Nenhuma pré-conferência registrada.")).toBeNull();
    await act(async () => { current.resolve([]); });
    expect(await screen.findByText("Nenhuma pré-conferência registrada.")).toBeTruthy();
  });

  it("descarta consulta antiga após mudança de prefeitura com mesmo processo", async () => {
    const original = pending<never[]>();
    const second = pending<never[]>();
    calls.history.mockReturnValueOnce(original.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    rerender(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-B" readOnly />);
    await waitFor(() => expect(calls.history).toHaveBeenCalledTimes(2));
    await act(async () => original.resolve([]));
    expect(screen.queryByText("Nenhuma pré-conferência registrada.")).toBeNull();
    await act(async () => second.resolve([]));
    expect(await screen.findByText("Nenhuma pré-conferência registrada.")).toBeTruthy();
  });

  it("recupera o histórico depois de erro usando o botão de nova consulta", async () => {
    calls.history.mockRejectedValueOnce(new Error("Falha temporária QA")).mockResolvedValueOnce([]);
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    expect(await screen.findByText(/Histórico indisponível: Falha temporária QA/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Consultar novamente" }));
    await waitFor(() => expect(calls.history).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Nenhuma pré-conferência registrada.")).toBeTruthy();
    expect(screen.queryByText(/Histórico indisponível: Falha temporária QA/)).toBeNull();
  });

  it("A-B-A: respostas antigas não apagam um erro da consulta mais recente", async () => {
    const firstA = pending<never[]>();
    const B = pending<never[]>();
    const latestA = pending<never[]>();
    calls.history.mockReturnValueOnce(firstA.promise).mockReturnValueOnce(B.promise).mockReturnValueOnce(latestA.promise);
    const { rerender } = render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    rerender(<UrbanPrecheckPanel process={process("B")} municipalityId="prefeitura-A" readOnly />);
    rerender(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    await waitFor(() => expect(calls.history).toHaveBeenCalledTimes(3));
    await act(async () => latestA.reject(new Error("Falha na consulta atual QA")));
    expect(await screen.findByText(/Histórico indisponível: Falha na consulta atual QA/)).toBeTruthy();
    await act(async () => { firstA.resolve([]); B.resolve([]); });
    expect(screen.getByText(/Histórico indisponível: Falha na consulta atual QA/)).toBeTruthy();
    expect(screen.queryByText("Nenhuma pré-conferência registrada.")).toBeNull();
  });

  it("ao trocar a prefeitura, uma falha antiga não substitui o histórico atual", async () => {
    const first = pending<never[]>();
    const second = pending<never[]>();
    calls.history.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    rerender(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-B" readOnly />);
    await waitFor(() => expect(calls.history).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve([]));
    expect(await screen.findByText("Nenhuma pré-conferência registrada.")).toBeTruthy();
    await act(async () => first.reject(new Error("Erro de prefeitura anterior QA")));
    expect(screen.queryByText(/Erro de prefeitura anterior QA/)).toBeNull();
    expect(screen.getByText("Nenhuma pré-conferência registrada.")).toBeTruthy();
  });

  it("mostra registro histórico real e não o classifica como aprovado quando falta norma arquivada", async () => {
    calls.history.mockResolvedValueOnce([{
      id: "audit-QA-01", process_id: "A", municipality_id: "prefeitura-A",
      regulation_version_id: "norma-arquivada-QA", reviewer_profile_id: "analista-QA",
      reference_date: "2026-10-23", created_at: "2026-10-23T12:00:00.000Z",
      measurements: { front_setback_m: { value: 6, evidence: "Prancha 02" } },
      legal_review: { evidence_ids: [], note: "Conferência humana QA documentada." },
    }]);
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    expect(await screen.findByText(/Norma histórica indisponível — resultado não verificável/)).toBeTruthy();
    expect(screen.getByText(/Conferência humana QA documentada/)).toBeTruthy();
    expect(screen.getByText(/Registro consultivo, não é aprovação/)).toBeTruthy();
  });

  it("distingue divergência e ausência de prova na norma histórica correspondente", async () => {
    calls.regulations.mockResolvedValueOnce([{
      id: "norma-historica-QA", municipality_id: "prefeitura-A", zone_code: "Z1",
      use_code: "RESIDENCIAL", effective_from: "2020-01-01", version: 2,
      status: "superseded", created_at: "2020-01-01T12:00:00Z",
      rules: [
        { metric: "front_setback_m", limit: 5, reference: "Lei fictícia de QA, art. 12" },
        { metric: "side_setback_m", limit: 2, reference: "Lei fictícia de QA, art. 13" },
      ],
    }]);
    calls.history.mockResolvedValueOnce([{
      id: "audit-QA-02", process_id: "A", municipality_id: "prefeitura-A",
      regulation_version_id: "norma-historica-QA", reviewer_profile_id: "analista-QA",
      reference_date: "2026-10-23", created_at: "2026-10-23T13:00:00.000Z",
      measurements: { front_setback_m: { value: 3, evidence: "Prancha 02" } },
    }]);
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    expect(await screen.findByText(/1 divergência\(s\) · 1 parâmetro\(s\) sem comprovação/)).toBeTruthy();
    expect(screen.getByText(/Registro consultivo, não é aprovação/)).toBeTruthy();
  });

  it("executa preenchimento, gravação consultiva e recarregamento do histórico pela interface", async () => {
    calls.regulations.mockResolvedValueOnce([{
      id: "norma-save-QA", municipality_id: "prefeitura-A", zone_code: "Z1",
      use_code: "RESIDENCIAL", effective_from: "2020-01-01",
      version: 1, status: "active", created_at: "2020-01-01T12:00:00Z",
      rules: [{ metric: "front_setback_m", limit: 5, reference: "Lei fictícia QA, art. 12" }],
    }]);
    calls.history.mockResolvedValueOnce([]).mockResolvedValueOnce([{
      id: "audit-save-QA", process_id: "A", municipality_id: "prefeitura-A",
      regulation_version_id: "norma-save-QA", reviewer_profile_id: "analista-QA",
      reference_date: "2026-10-23", created_at: "2026-10-23T14:00:00.000Z",
      measurements: { front_setback_m: { value: 6, evidence: "Prancha 02" } },
    }]);
    calls.save.mockResolvedValueOnce(undefined);
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly={false} />);
    fireEvent.change(screen.getByPlaceholderText("Ex.: ZR1"), { target: { value: "Z1" } });
    expect(await screen.findByText(/Norma ativa: Z1/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Medição: Recuo frontal" }), { target: { value: "6" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Evidência: Recuo frontal" }), { target: { value: "Prancha 02" } });
    const saveButton = screen.getByRole("button", { name: /Registrar pré-conferência/i });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(saveButton);
    await waitFor(() => expect(calls.save).toHaveBeenCalledTimes(1));
    expect(calls.save.mock.calls[0][0]).toBe("A");
    expect(calls.save.mock.calls[0][1]).toBe("norma-save-QA");
    expect(calls.save.mock.calls[0][3]).toEqual({ front_setback_m: { value: 6, evidence: "Prancha 02" } });
    expect(await screen.findByText(/Pré-conferência registrada e histórico atualizado/)).toBeTruthy();
    expect(calls.history).toHaveBeenCalledTimes(2);
  });

  it("impede registro duplicado por duplo clique e identifica edições posteriores não salvas", async () => {
    calls.regulations.mockResolvedValueOnce([{
      id: "norma-save-QA", municipality_id: "prefeitura-A", zone_code: "Z1",
      use_code: "RESIDENCIAL", effective_from: "2020-01-01", version: 1,
      status: "active", created_at: "2020-01-01T12:00:00Z",
      rules: [{ metric: "front_setback_m", limit: 5, reference: "Lei fictícia QA, art. 12" }],
    }]);
    const saving = pending<void>();
    const refresh = pending<never[]>();
    calls.history.mockResolvedValueOnce([]).mockReturnValueOnce(refresh.promise);
    calls.save.mockReturnValueOnce(saving.promise);
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly={false} />);
    fireEvent.change(screen.getByPlaceholderText("Ex.: ZR1"), { target: { value: "Z1" } });
    expect(await screen.findByText(/Norma ativa: Z1/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Medição: Recuo frontal" }), { target: { value: "6" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Evidência: Recuo frontal" }), { target: { value: "Prancha 02" } });
    const button = screen.getByRole("button", { name: /Registrar pré-conferência/i });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls.save).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Medição: Recuo frontal" }), { target: { value: "7" } });
    await act(async () => saving.resolve());
    await waitFor(() => expect(calls.history).toHaveBeenCalledTimes(2));
    await act(async () => refresh.resolve([]));
    expect(await screen.findByText(/Existem alterações posteriores nesta tela que ainda não foram salvas/)).toBeTruthy();
    expect(calls.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["occupancy_percent", "Taxa de ocupação", "101"],
    ["permeability_percent", "Permeabilidade", "101"],
    ["front_setback_m", "Recuo frontal", "100001"],
  ])("impede gravar %s fora dos limites também pela interface", async (metric, label, value) => {
    calls.regulations.mockResolvedValueOnce([{
      id: "norma-limites-QA", municipality_id: "prefeitura-A", zone_code: "Z1",
      use_code: "RESIDENCIAL", effective_from: "2020-01-01", version: 1,
      status: "active", created_at: "2020-01-01T12:00:00Z",
      rules: [{ metric, limit: 5, reference: "Lei fictícia QA art. 12" }],
    }]);
    calls.history.mockResolvedValueOnce([]);
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly={false} />);
    fireEvent.change(screen.getByPlaceholderText("Ex.: ZR1"), { target: { value: "Z1" } });
    expect(await screen.findByText(/Norma ativa: Z1/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Medição: " + label }), { target: { value } });
    fireEvent.change(screen.getByRole("textbox", { name: "Evidência: " + label }), { target: { value: "Prancha 02, cotas QA" } });
    expect(screen.getByRole("button", { name: /Registrar pré-conferência/i }).hasAttribute("disabled")).toBe(true);
    expect(calls.save).not.toHaveBeenCalled();
  });

  it("mostra erro real de histórico sem afirmar que está vazio", async () => {
    calls.history.mockRejectedValueOnce(new Error("Falha de rede QA"));
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    expect(await screen.findByText(/Histórico indisponível: Falha de rede QA/)).toBeTruthy();
    expect(screen.queryByText("Nenhuma pré-conferência registrada.")).toBeNull();
  });
});
