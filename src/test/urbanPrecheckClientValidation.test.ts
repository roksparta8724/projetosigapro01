import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({
  backendClient: { rpc },
}));
import { saveUrbanPrecheckRun } from "@/integrations/backend/urbanPrecheckClient";

const processId = "processo-qa";
const versionId = "norma-qa";
const evidence = "Prancha QA, quadro de areas";
const date = "2026-10-23";
const review = { evidenceIds: [] as string[], note: "", documentScopeConfirmed: false };

describe("SIGAPRO IA — validação do payload antes de chegar ao banco", () => {
  beforeEach(() => { rpc.mockReset().mockResolvedValue({ data: { id: "qa" }, error: null }); });

  it.each([
    ["taxa de ocupação superior a 100%", { occupancy_percent: { value: 101, evidence } }],
    ["permeabilidade superior a 100%", { permeability_percent: { value: 101, evidence } }],
    ["medida fisicamente fora do limite", { front_setback_m: { value: 100001, evidence } }],
    ["número de pavimentos fracionado", { floor_count: { value: 2.5, evidence } }],
    ["evidência documental ausente", { front_setback_m: { value: 5, evidence: "" } }],
  ])("rejeita %s sem disparar RPC", async (_label, measurements) => {
    await expect(saveUrbanPrecheckRun(processId, versionId, date, measurements, review))
      .rejects.toThrow(/Medições inválidas/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejeita identificador de referência legal não UUID", async () => {
    await expect(saveUrbanPrecheckRun(processId, versionId, date,
      { front_setback_m: { value: 5, evidence } },
      { ...review, evidenceIds: ["referencia-invalida"] }))
      .rejects.toThrow(/Revisão legal inválida/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("aceita medida válida e transmite a revisão legal completa", async () => {
    await saveUrbanPrecheckRun(processId, versionId, date,
      { front_setback_m: { value: 5, evidence } }, review);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_urban_precheck_run_v5", expect.objectContaining({
      _process_id: processId,
      _regulation_version_id: versionId,
      _legal_review: { evidence_ids: [], note: "", document_scope_confirmed: false },
    }));
  });
});
