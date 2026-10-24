import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({
  backendClient: { rpc },
}));

import { listUrbanRegulations, listUrbanPrecheckHistory, saveUrbanPrecheckRun } from "@/integrations/backend/urbanPrecheckClient";

const validMeasurement = {
  front_setback_m: { value: 6, evidence: "Prancha 02 - recuo frontal" },
};
const review = { evidenceIds: [], note: "", documentScopeConfirmed: false };
const validRow = {
  id: "run-1", municipality_id: "municipio-a", process_id: "processo-a",
  regulation_version_id: "norma-a", measurements: validMeasurement,
  reference_date: "2026-10-23", reviewer_profile_id: "analista-a",
  created_at: "2026-10-23T12:00:00.000Z",
};

describe("SIGAPRO IA - contrato do cliente de pré-conferência", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [], error: null });
  });

  it("recusa histórico de outro processo mesmo quando a RPC retorna sucesso", async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...validRow, process_id: "processo-b" }], error: null });
    await expect(listUrbanPrecheckHistory("processo-a")).rejects.toThrow(/inconsistente/i);
  });

  it("recusa histórico malformado, nulo ou com lista de medições", async () => {
    for (const data of [null, {}, [{ ...validRow, measurements: [] }], [null]]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(listUrbanPrecheckHistory("processo-a")).rejects.toThrow();
    }
  });

  it.each([
    ["sem identificador do analista", { ...validRow, reviewer_profile_id: "" }],
    ["data de gravação ilegível", { ...validRow, created_at: "invalid" }],
    ["data legal malformada", { ...validRow, reference_date: "2026-99-99" }],
    ["revisão legal em formato inesperado", { ...validRow, legal_review: [] }],
  ])("impede exibir auditoria incompleta: %s", async (_label, row) => {
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    await expect(listUrbanPrecheckHistory("processo-a")).rejects.toThrow(/inconsistente/i);
  });

  it.each([
    ["medição negativa", { front_setback_m: { value: -2, evidence: "Prancha 02" } }],
    ["valor não numérico", { front_setback_m: { value: "6", evidence: "Prancha 02" } }],
    ["valor infinito", { front_setback_m: { value: Infinity, evidence: "Prancha 02" } }],
    ["prova inexistente", { front_setback_m: { value: 6, evidence: "" } }],
    ["métrica desconhecida", { unknown_metric: { value: 6, evidence: "Prancha 02" } }],
    ["pavimentos fracionários", { floor_count: { value: 1.5, evidence: "Prancha 02" } }],
    ["nenhuma medição", {}],
  ])("rejeita histórico com %s", async (_label, measurements) => {
    rpc.mockResolvedValueOnce({ data: [{ ...validRow, measurements }], error: null });
    await expect(listUrbanPrecheckHistory("processo-a")).rejects.toThrow(/inconsistente/i);
  });

  it("aceita o histórico coerente e usa a RPC de leitura autorizada", async () => {
    rpc.mockResolvedValueOnce({ data: [validRow], error: null });
    await expect(listUrbanPrecheckHistory("processo-a")).resolves.toEqual([validRow]);
    expect(rpc).toHaveBeenCalledWith("list_urban_prechecks_v1", { _process_id: "processo-a" });
  });

  it("propaga falhas de permissão do banco sem mascarar como lista vazia", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Sem acesso ao historico de analises." } });
    await expect(listUrbanPrecheckHistory("processo-a")).rejects.toThrow(/Sem acesso/);
  });

  it("grava exatamente o processo, a norma, a data, as evidências e a revisão declarados", async () => {
    const documentedReview = {
      evidenceIds: ["evidencia-1"], note: "Conferência humana documentada no arquivo urbanístico.",
      documentScopeConfirmed: true,
    };
    await saveUrbanPrecheckRun("processo-a", "norma-a", "2026-10-23", validMeasurement, documentedReview);
    expect(rpc).toHaveBeenCalledWith("save_urban_precheck_run_v4", {
      _process_id: "processo-a", _regulation_version_id: "norma-a",
      _reference_date: "2026-10-23", _measurements: validMeasurement,
      _legal_review: {
        evidence_ids: ["evidencia-1"],
        note: "Conferência humana documentada no arquivo urbanístico.",
        document_scope_confirmed: true,
      },
    });
  });

  it.each([
    ["medições vazias", {}],
    ["evidência curta", { front_setback_m: { value: 5, evidence: "X" } }],
    ["valor negativo", { front_setback_m: { value: -1, evidence: "Prancha 02" } }],
    ["métrica não prevista", { invented_metric: { value: 10, evidence: "Prancha 02" } }],
    ["pavimentos fracionários", { floor_count: { value: 1.5, evidence: "Prancha 02" } }],
  ])("impede envio de %s", async (_label, measurements) => {
    await expect(saveUrbanPrecheckRun("processo-a", "norma-a", "2026-10-23",
      measurements as typeof validMeasurement, review)).rejects.toThrow(/Medições inválidas/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejeita citações repetidas ou revisão sem confirmação booleana", async () => {
    await expect(saveUrbanPrecheckRun("processo-a", "norma-a", "2026-10-23",
      validMeasurement, { ...review, evidenceIds: ["e1", "e1"] })).rejects.toThrow(/revisão legal inválida/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("não tenta gravar quando o banco recusa a operação", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Acesso negado ao processo." } });
    await expect(saveUrbanPrecheckRun("processo-a", "norma-a", "2026-10-23",
      validMeasurement, review)).rejects.toThrow(/Acesso negado/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejeita normas devolvidas por outra prefeitura", async () => {
    rpc.mockResolvedValueOnce({ data: [{
      id: "norma-de-fora", municipality_id: "municipio-b", zone_code: "Z1",
      use_code: "RESIDENCIAL", status: "active", version: 1,
      effective_from: "2026-01-01", rules: [],
    }], error: null });
    await expect(listUrbanRegulations("municipio-a")).rejects.toThrow(/inconsistente/i);
  });

  it("rejeita resposta de normas que não é lista", async () => {
    rpc.mockResolvedValueOnce({ data: { id: "norma-invalida" }, error: null });
    await expect(listUrbanRegulations("municipio-a")).rejects.toThrow(/inválida/i);
  });

  it("aceita catálogo vazio autorizado sem inventar legislação", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(listUrbanRegulations("municipio-a")).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("list_urban_regulation_versions_v1", { _municipality_id: "municipio-a" });
  });

  it("propaga indisponibilidade do cadastro de normas", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Cadastro municipal indisponível." } });
    await expect(listUrbanRegulations("municipio-a")).rejects.toThrow(/Cadastro municipal indisponível/);
  });

});
