import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({ backendClient: { rpc } }));
import { saveUrbanPrecheckRun } from "@/integrations/backend/urbanPrecheckClient";

const requestId = "00000000-0000-4000-8000-000000000001";
const evidenceId = "00000000-0000-4000-8000-000000000002";
const measurements = { front_setback_m: { value: 5, evidence: "Prancha 01 — cota frontal" } };
const legalReview = { evidenceIds: [evidenceId], note: "Conferência documental", documentScopeConfirmed: true };
const save = (m: any = measurements, review: any = legalReview, id = requestId) =>
  saveUrbanPrecheckRun("processo-a", "norma-a", "2026-10-23", m, review, id);

describe("SIGAPRO — limites da gravação de pré-conferência", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null }); });

  it("mantém o mesmo identificador e payload em reenvio explícito", async () => {
    await save();
    await save();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0][1]._request_id).toBe(requestId);
  });

  it.each([
    ["sem medições", {}],
    ["medição negativa", { front_setback_m: { value: -1, evidence: "Prancha 01" } }],
    ["prova sem referência", { front_setback_m: { value: 5, evidence: " " } }],
    ["número de pavimentos fracionário", { floor_count: { value: 2.5, evidence: "Corte A" } }],
    ["ocupação superior a cem", { occupancy_percent: { value: 101, evidence: "Quadro de áreas" } }],
  ])("bloqueia %s antes de escrever no banco", async (_name, invalid) => {
    await expect(save(invalid)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("bloqueia evidências legais repetidas", async () => {
    await expect(save(measurements, { ...legalReview, evidenceIds: [evidenceId, evidenceId] })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("bloqueia identificador de reenvio inválido", async () => {
    await expect(save(measurements, legalReview, "identificador-invalido")).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
