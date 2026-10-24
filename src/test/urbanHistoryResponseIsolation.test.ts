import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({backendClient:{rpc}}));
import {listUrbanPrecheckHistory} from "@/integrations/backend/urbanPrecheckClient";

const valid = {
  id:"historico-1",municipality_id:"prefeitura-a",
  process_id:"processo-a",regulation_version_id:"norma-1",measurements:{front_setback_m:{value:6,evidence:"Prancha 02 — cota frontal"}},
  reference_date:"2026-10-23",reviewer_profile_id:"analista-a",
  created_at:"2026-10-23T12:00:00Z",
};
describe("SIGAPRO — isolamento do histórico retornado pelo banco", () => {
  beforeEach(()=>rpc.mockReset());
  it.each(["", "   "])("impede consulta de histórico sem identificação válida: %j", async (processId) => {
    await expect(listUrbanPrecheckHistory(processId)).rejects.toThrow("Processo inválido");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("não confunde erro de rede com histórico vazio", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Falha temporária de rede" } });
    await expect(listUrbanPrecheckHistory("processo-a")).rejects.toThrow("Falha temporária de rede");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("não confunde resposta incorreta com histórico vazio", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(listUrbanPrecheckHistory("processo-a")).rejects.toThrow("indisponível");
  });
  it("aceita histórico consistente do processo solicitado", async()=>{
    rpc.mockResolvedValueOnce({data:[valid],error:null});
    await expect(listUrbanPrecheckHistory("processo-a")).resolves.toEqual([valid]);
  });
  it.each([
    ["outro processo",{...valid,process_id:"processo-b"}],
    ["sem identificação",{...valid,id:null}],
    ["sem prefeitura",{...valid,municipality_id:null}],
    ["sem versão legal",{...valid,regulation_version_id:null}],
    ["medição inválida",{...valid,measurements:null}],
    ["ocupação acima de 100%",{...valid,measurements:{occupancy_percent:{value:120,evidence:"Prancha 02"}}}],
    ["permeabilidade acima de 100%",{...valid,measurements:{permeability_percent:{value:150,evidence:"Prancha 02"}}}],
    ["medição acima do limite",{...valid,measurements:{front_setback_m:{value:100001,evidence:"Prancha 02"}}}],
    ["pavimento fracionado",{...valid,measurements:{floor_count:{value:2.5,evidence:"Prancha 02"}}}],
    ["revisão com evidência de tipo errado",{...valid,legal_review:{evidence_ids:"não é lista"}}],
    ["revisão com evidência inválida",{...valid,legal_review:{evidence_ids:["arquivo-incorreto"]}}],
    ["revisão com evidência duplicada",{...valid,legal_review:{evidence_ids:["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000001"]}}],
    ["revisão com confirmação textual",{...valid,legal_review:{document_scope_confirmed:"sim"}}],
    ["revisão com data inválida",{...valid,legal_review:{reviewed_at:"ontem"}}],
    ["revisão com nota excessiva",{...valid,legal_review:{note:"a".repeat(1201)}}],
  ])("não mostra registros %s",async (_label,record)=>{
    rpc.mockResolvedValueOnce({data:[record],error:null});
    await expect(listUrbanPrecheckHistory("processo-a")).rejects.toThrow("inconsistente");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
