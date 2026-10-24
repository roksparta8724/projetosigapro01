import {beforeEach,describe,expect,it,vi} from "vitest";
const rpc=vi.hoisted(()=>vi.fn());
vi.mock("@/integrations/backend/databaseClient",()=>({backendClient:{rpc}}));
import {listUrbanRegulations} from "@/integrations/backend/urbanPrecheckClient";
const item={id:"norma-1",municipality_id:"municipio-a",zone_code:"ZR1",use_code:"RESIDENCIAL",
  effective_from:"2026-01-01",version:1,status:"active",rules:[],created_at:"2026-01-01T12:00:00Z"};
describe("SIGAPRO — catálogo legal isolado por prefeitura",()=>{
  beforeEach(()=>rpc.mockReset());
  it("aceita norma vinculada à prefeitura da consulta",async()=>{
    rpc.mockResolvedValueOnce({data:[item],error:null});
    await expect(listUrbanRegulations("municipio-a")).resolves.toEqual([item]);
  });
  it.each([
    ["prefeitura diferente",{...item,municipality_id:"municipio-b"}],
    ["sem identificador",{...item,id:null}],
    ["sem zoneamento",{...item,zone_code:null}],
    ["regras malformadas",{...item,rules:{}}],
  ])("rejeita %s",async(_reason,invalid)=>{
    rpc.mockResolvedValueOnce({data:[invalid],error:null});
    await expect(listUrbanRegulations("municipio-a")).rejects.toThrow("inconsistente");
  });
});
