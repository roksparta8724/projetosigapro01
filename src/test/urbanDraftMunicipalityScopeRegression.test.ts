import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({ backendClient: { rpc } }));
import { saveUrbanRegulationDraft } from "@/integrations/backend/urbanPrecheckClient";

const rules = [{ metric: "front_setback_m" as const, limit: 5, reference: "Lei municipal fictícia 123/2020" }];
describe("SIGAPRO — escopo municipal obrigatório ao gravar norma", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({data:null,error:null}); });
  it.each(["", "   "])("impede rascunho sem prefeitura %j", async municipality => {
    await expect(saveUrbanRegulationDraft(municipality,"ZR1","RES","2026-01-01",rules)).rejects.toThrow("Informe zona");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("preserva o escopo e normaliza zona e uso válidos", async () => {
    await saveUrbanRegulationDraft("prefeitura-a"," zr1 "," res ","2026-01-01",rules);
    expect(rpc).toHaveBeenCalledWith("save_urban_regulation_draft_v1",{
      _municipality_id:"prefeitura-a",_zone_code:"ZR1",_use_code:"RES",_effective_from:"2026-01-01",_rules:rules
    });
  });
});
