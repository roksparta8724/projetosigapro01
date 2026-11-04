import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/backend/databaseClient", () => ({
  backendClient: { rpc: mock.rpc },
}));
import { assertUrbanLegislationWriteAccess } from "@/integrations/backend/urbanLegislationRegistryClient";
const municipality = "11111111-1111-4111-8111-111111111111";
describe("municipal legal archive preflight", () => {
  beforeEach(() => vi.resetAllMocks());
  it("requires a real tenant-bound grant before any PDF upload", async () => {
    mock.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(assertUrbanLegislationWriteAccess(municipality)).resolves.toBeUndefined();
    expect(mock.rpc).toHaveBeenCalledWith("can_manage_urban_legislation_registry_v1",
      { _municipality_id: municipality });
  });
  it("blocks absent/mismatched permission migrations with actionable guidance", async () => {
    mock.rpc.mockResolvedValueOnce({ data:null, error:{code:"PGRST202",message:"Could not find the function"} });
    await expect(assertUrbanLegislationWriteAccess(municipality)).rejects.toThrow("sincronizar a migração");
  });
  it("never promotes a denied account to Master and never permits another municipality", async () => {
    mock.rpc.mockResolvedValueOnce({ data:false, error:null });
    await expect(assertUrbanLegislationWriteAccess(municipality)).rejects.toThrow("O banco não autorizou");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    await expect(assertUrbanLegislationWriteAccess("invalid")).rejects.toThrow("identificar a Prefeitura");
  });
  it("keeps the legacy PDF batch uncommitted until the database confirms all files", () => {
    const settings = require("node:fs").readFileSync("src/pages/saas/ConfiguracoesPage.tsx","utf8") as string;
    const start = settings.indexOf('const handleSaveInstitutionalAssets = async');
    const before = settings.slice(start,settings.indexOf('if (hasBackendEnv) {\n        await withTimeout(',start));
    expect(before).not.toContain("setPlanoDiretorFiles(nextPlanoDiretorFiles)");
    expect(before).not.toContain("setUsoSoloFiles(nextUsoSoloFiles)");
    expect(settings).toContain("stagedLegalUploadsRef.current");
    expect(settings).toContain("await assertUrbanLegislationWriteAccess(savedTenantId)");
  });
});
