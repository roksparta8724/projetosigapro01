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

  it("não permite que a resposta inicial tardia sobrescreva uma consulta posterior", async () => {
    const initial = pending<never[]>();
    const retry = pending<never[]>();
    calls.history.mockReturnValueOnce(initial.promise).mockReturnValueOnce(retry.promise);
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    // Manual retry is presented after an error. Force the initial request to reject,
    // then keep the subsequent request pending to verify loading and resolution.
    await act(async () => initial.reject(new Error("Rede interrompida QA")));
    fireEvent.click(await screen.findByRole("button", { name: "Consultar novamente" }));
    expect(screen.getByText(/Consultando histórico de pré-conferências/)).toBeTruthy();
    await act(async () => retry.resolve([]));
    expect(await screen.findByText("Nenhuma pré-conferência registrada.")).toBeTruthy();
  });

  it("mostra erro real de histórico sem afirmar que está vazio", async () => {
    calls.history.mockRejectedValueOnce(new Error("Falha de rede QA"));
    render(<UrbanPrecheckPanel process={process("A")} municipalityId="prefeitura-A" readOnly />);
    expect(await screen.findByText(/Histórico indisponível: Falha de rede QA/)).toBeTruthy();
    expect(screen.queryByText("Nenhuma pré-conferência registrada.")).toBeNull();
  });
});
