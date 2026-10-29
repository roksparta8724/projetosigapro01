import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({ backendClient: { rpc } }));
import { saveUrbanPrecheckRun } from "@/integrations/backend/urbanPrecheckClient";

const measurements = { front_setback_m: { value: 5, evidence: "Prancha sintética QA página 1" } };
const legalReview = { evidenceIds: [], note: "", documentScopeConfirmed: false };
const validRequestId = "9b0b4e44-8808-4722-a8eb-2331638761c9";

describe("SIGAPRO IA — identificação segura antes do banco", () => {
  beforeEach(() => rpc.mockReset());
  it.each([
    ["processo nulo", null, "versao-a", validRequestId],
    ["processo numérico", 33, "versao-a", validRequestId],
    ["versão nula", "processo-a", null, validRequestId],
    ["versão numérica", "processo-a", 4, validRequestId],
    ["request ID numérico", "processo-a", "versao-a", 99],
    ["request ID nulo", "processo-a", "versao-a", null],
  ])("rejeita %s sem executar RPC", async (_label, processId, versionId, requestId) => {
    await expect(saveUrbanPrecheckRun(
      processId as string, versionId as string, "2026-10-23",
      measurements, legalReview, requestId as string,
    )).rejects.toThrow(/inválid/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
