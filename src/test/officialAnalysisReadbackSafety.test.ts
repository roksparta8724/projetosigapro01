import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/backend/databaseClient", () => ({
  backendClient: { rpc: mocks.rpc },
}));
import { readOfficialAnalysisSheet, writeOfficialAnalysisSheet } from "@/integrations/backend/analysisSheetClient";

const processId = "f0a659b0-395f-48ad-a29f-70362d9cf4a6";
const validPayload = {
  schema: "sigapro.urban-analysis-checklist.v2",
  processId,
  municipalityId: "11111111-1111-4111-8111-111111111111",
  items: {},
};
beforeEach(() => mocks.rpc.mockReset());

describe("SIGAPRO: official checklist readback must fail closed", () => {
  it("accepts a validated, municipality-scoped official sheet", async () => {
    mocks.rpc.mockResolvedValue({ data: { found: true, revision: 4, payload: validPayload }, error: null });
    expect(await readOfficialAnalysisSheet(processId)).toMatchObject({ found: true, revision: 4, payload: validPayload });
    expect(mocks.rpc).toHaveBeenCalledWith("get_process_analysis_sheet_v2", { _process_id: processId });
  });
  it("accepts only a clean not-found response as a new draft", async () => {
    mocks.rpc.mockResolvedValue({ data: { found: false, revision: 0, payload: null }, error: null });
    expect(await readOfficialAnalysisSheet(processId)).toEqual({
      found: false, revision: 0, payload: null, updated_at: undefined, updated_by_profile_id: undefined,
    });
  });
  it.each([
    { found: true, revision: 3, payload: null },
    { found: true, revision: 0, payload: validPayload },
    { found: true, revision: 3, payload: { ...validPayload, processId: "foreign-process" } },
    { found: true, revision: 3, payload: { ...validPayload, items: [] } },
    { found: true, revision: 3, payload: { ...validPayload, schema: "untrusted" } },
    { found: false, revision: 3, payload: null },
    { found: false, revision: 0, payload: validPayload },
    { found: true, revision: Number.MAX_SAFE_INTEGER + 1, payload: validPayload },
    { revision: 0, payload: null },
  ])("rejects inconsistent database evidence: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(readOfficialAnalysisSheet(processId)).rejects.toThrow();
  });
  it("does not represent network errors as an empty official sheet", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(readOfficialAnalysisSheet(processId)).rejects.toThrow("database unavailable");
  });
  it("requires an increased server revision before confirming any draft as saved", async () => {
    mocks.rpc.mockResolvedValue({ data: { revision: 2 }, error: null });
    await expect(writeOfficialAnalysisSheet(processId, validPayload, 2)).rejects.toThrow("Revisão oficial não confirmada");
    mocks.rpc.mockResolvedValue({ data: { revision: 3 }, error: null });
    await expect(writeOfficialAnalysisSheet(processId, validPayload, 2)).resolves.toBe(3);
  });
  it("unlocks the edit revision only after payload validation", () => {
    const panel = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
    const start = panel.indexOf(".then((sheet) => {");
    const guard = panel.indexOf("checklistPayloadMatchesProcess(sheet.payload", start);
    const unlocked = panel.indexOf("setOfficialRevision(sheet.revision)", start);
    expect(start).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(start);
    expect(unlocked).toBeGreaterThan(guard);
    expect(panel.slice(start, unlocked)).toContain("throw new Error");
  });
  it("requires the API to reject unsaved analyst/director signatures even when called directly", () => {
    const api = readFileSync(resolve(process.cwd(), "api/e-sign-artifact.ts"), "utf8");
    expect(api).toContain('if (artifactType === "urban_analysis_checklist")');
    expect(api).toContain('"get_process_analysis_sheet_v2"');
    expect(api).toContain('official.found !== true');
    expect(api).toContain('official.payload.processId !== processId');
    expect(api).toContain('stableStringify(official.payload) !== stableStringify(payload)');
    expect(api).toContain('"ANALYSIS_SHEET_NOT_SAVED"');
    expect(api).toContain('409,');
  });
  it("blocks technical/director signatures while the authoritative sheet is unavailable", () => {
    const panel = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"), "utf8");
    const signGuard = "if (officialSheetLoading || officialRevision === null)";
    expect(panel.split(signGuard)).toHaveLength(3);
    expect(panel).toContain("Leitura oficial indisponível. Não é permitido assinar um rascunho local.");
    const canSign = panel.slice(panel.indexOf("const canSignTechnical ="), panel.indexOf("const isDirectorProfile"));
    expect(canSign).toContain("!officialSheetLoading");
    expect(canSign).toContain("officialRevision !== null");
    const canRequest = panel.slice(panel.indexOf("const canRequestDirector ="), panel.indexOf("const isFullySigned"));
    expect(canRequest).toContain("!officialSheetLoading");
    expect(canRequest).toContain("officialRevision !== null");
  });
});
