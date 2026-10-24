import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({
  backendClient: { rpc },
}));
import type { UrbanMeasurements } from "@/lib/urbanPrecheck";
import { saveUrbanPrecheckRun, saveUrbanRegulationDraft, listUrbanPrecheckHistory } from "@/integrations/backend/urbanPrecheckClient";

const ok = { front_setback_m: { value: 5, evidence: "Prancha de implantação 01" } };
const review = { evidenceIds: [], note: "", documentScopeConfirmed: false };

describe("SIGAPRO IA — integração simulada da gravação municipal", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
  });

  it("grava um registro documental válido pela função RPC correta", async () => {
    await saveUrbanPrecheckRun("processo-qa", "norma-qa", "2024-02-29", ok, review);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_urban_precheck_run_v4", {
      _process_id: "processo-qa",
      _regulation_version_id: "norma-qa",
      _reference_date: "2024-02-29",
      _measurements: ok,
      _legal_review: {
        evidence_ids: [],
        note: "",
        document_scope_confirmed: false,
      },
    });
  });

  it.each([
    ["data impossível", "2025-02-29", ok, review],
    ["medição infinita", "2024-02-29", {front_setback_m:{value:Infinity,evidence:"Prancha 01"}}, review],
    ["medição sem fonte", "2024-02-29", {front_setback_m:{value:5,evidence:""}}, review],
    ["pavimento fracionário", "2024-02-29", {floor_count:{value:2.5,evidence:"Prancha 01"}}, review],
    ["métrica desconhecida", "2024-02-29", {inventada:{value:1,evidence:"Prancha 01"}}, review],
    ["revisão duplicada", "2024-02-29", ok, {...review,evidenceIds:["prova-1","prova-1"]}],
  ])("bloqueia %s antes da comunicação com o banco", async (_label, date, measurements, confirmation) => {
    await expect(saveUrbanPrecheckRun("processo-qa", "norma-qa", date, measurements as UrbanMeasurements, confirmation)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("não informa sucesso quando a função RPC falha", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: {message:"Operação negada"} });
    await expect(saveUrbanPrecheckRun("processo-qa", "norma-qa", "2024-02-29", ok, review))
      .rejects.toThrow("Operação negada");
  });

  it("aceita minuta de norma com vigência futura válida", async () => {
    await saveUrbanRegulationDraft("prefeitura-qa", "ZR1", "Residencial", "2028-02-29",
      [{metric:"front_setback_m",limit:5,reference:"Lei Municipal 123, artigo 15"}]);
    expect(rpc).toHaveBeenCalledWith("save_urban_regulation_draft_v1", expect.objectContaining({
      _effective_from:"2028-02-29", _municipality_id:"prefeitura-qa",
    }));
  });

  it("rejeita histórico retornado em formato inesperado", async () => {
    rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(listUrbanPrecheckHistory("processo-qa")).rejects.toThrow("Histórico");
  });
});
