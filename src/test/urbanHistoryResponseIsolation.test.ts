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
  ])("não mostra registros %s",async (_label,record)=>{
    rpc.mockResolvedValueOnce({data:[record],error:null});
    await expect(listUrbanPrecheckHistory("processo-a")).rejects.toThrow("inconsistente");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
