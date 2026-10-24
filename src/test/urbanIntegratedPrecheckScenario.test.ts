import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveUrbanAreaMeasurements } from "@/lib/urbanPrecheckAssist";
import { evaluateUrbanPrecheck, selectUrbanRegulation, type UrbanRegulationVersion } from "@/lib/urbanPrecheck";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/backend/databaseClient", () => ({ backendClient: { rpc } }));
import { saveUrbanPrecheckRun, listUrbanPrecheckHistory } from "@/integrations/backend/urbanPrecheckClient";

const municipality = "municipio-homologacao";
const protocol = "processo-homologacao";
const rules = [
  { metric: "occupancy_percent" as const, limit: 60, reference: "Lei Municipal 123, art. 10" },
  { metric: "permeability_percent" as const, limit: 20, reference: "Lei Municipal 123, art. 11" },
  { metric: "floor_area_ratio" as const, limit: 2, reference: "Lei Municipal 123, art. 12" },
];
const regulation: UrbanRegulationVersion = {
  id: "norma-2026", municipality_id: municipality, zone_code: "ZR1", use_code: "RESIDENCIAL",
  effective_from: "2026-01-01", status: "active", version: 1,
  created_at: "2026-01-01T00:00:00Z", rules,
};

describe("SIGAPRO — cenário integrado da pré-análise municipal", () => {
  beforeEach(() => { rpc.mockReset(); });
  it("seleciona norma municipal, calcula índices, aponta divergência, persiste e recupera histórico", async () => {
    const selected=selectUrbanRegulation([regulation], municipality,"ZR1","RESIDENCIAL","2026-10-23");
    expect(selected?.id).toBe("norma-2026");

    const { measurements, warnings }=deriveUrbanAreaMeasurements({
      lot:{value:250,evidence:"Implantação, prancha A1"},
      footprint:{value:155,evidence:"Projeção, prancha A1"},
      permeable:{value:70,evidence:"Quadro de áreas, prancha A2"},
      totalFloor:{value:375,evidence:"Área computável, prancha A2"},
    });
    expect(warnings).toEqual([]);
    const findings=evaluateUrbanPrecheck(selected!.rules,measurements);
    expect(findings.find(f=>f.metric==="occupancy_percent")?.status).toBe("attention");
    expect(findings.find(f=>f.metric==="permeability_percent")?.status).toBe("within_limit");
    expect(findings.find(f=>f.metric==="floor_area_ratio")?.status).toBe("within_limit");

    rpc.mockResolvedValueOnce({data:null,error:null});
    await saveUrbanPrecheckRun(protocol, selected!.id, "2026-10-23", measurements,
      {evidenceIds:[],note:"",documentScopeConfirmed:false});
    expect(rpc).toHaveBeenNthCalledWith(1,"save_urban_precheck_run_v4",
      expect.objectContaining({_process_id:protocol,_regulation_version_id:"norma-2026",_measurements:measurements}));

    const persisted={id:"run-qa",municipality_id:municipality,process_id:protocol,
      regulation_version_id:selected!.id,reference_date:"2026-10-23",measurements,
      reviewer_profile_id:"analista-qa",created_at:"2026-10-23T12:00:00Z"};
    rpc.mockResolvedValueOnce({data:[persisted],error:null});
    const history=await listUrbanPrecheckHistory(protocol);
    expect(history).toHaveLength(1);
    expect(history[0].measurements.occupancy_percent?.value).toBe(62);
    expect(history[0].regulation_version_id).toBe(selected!.id);
  });

  it("não mistura legislação de outra prefeitura ou fora da vigência", () => {
    expect(selectUrbanRegulation([regulation],"outro-municipio","ZR1","RESIDENCIAL","2026-10-23")).toBeNull();
    expect(selectUrbanRegulation([regulation],municipality,"ZR1","RESIDENCIAL","2025-12-31")).toBeNull();
    expect(selectUrbanRegulation([regulation],municipality,"ZR2","RESIDENCIAL","2026-10-23")).toBeNull();
  });
});
