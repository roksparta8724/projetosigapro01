import {beforeEach,describe,expect,it,vi} from "vitest";
const rpc=vi.hoisted(()=>vi.fn());
vi.mock("@/integrations/backend/databaseClient",()=>({backendClient:{rpc}}));
import {listUrbanLegalEvidence} from "@/integrations/backend/urbanLegalEvidenceClient";

const record={id:"scope-1",evidence_id:"document-1",municipality_id:"municipio-a",
  document_title:"Lei de teste",document_sha256:"a".repeat(64),page_number:1,
  metric:"front_setback_m",excerpt:"Recuo frontal de cinco metros.",
  zone_code:"ZR1",use_code:"RESIDENCIAL",effective_from:"2025-01-01",
  effective_until:null,created_at:"2025-01-01T10:00:00Z"};

describe("SIGAPRO — isolamento do acervo de evidências municipais",()=>{
  beforeEach(()=>rpc.mockReset());
  it("aceita documentos da prefeitura solicitada",async()=>{
    rpc.mockResolvedValueOnce({data:[record],error:null});
    await expect(listUrbanLegalEvidence("municipio-a")).resolves.toEqual([record]);
  });
  it.each([
    ["outro município",{...record,municipality_id:"municipio-b"}],
    ["sem identificador",{...record,id:null}],
    ["métrica inválida",{...record,metric:null}],
  ])("bloqueia %s",async(_name,bad)=>{
    rpc.mockResolvedValueOnce({data:[bad],error:null});
    await expect(listUrbanLegalEvidence("municipio-a")).rejects.toThrow("inconsistente");
  });
  it("não consulta banco sem município",async()=>{
    await expect(listUrbanLegalEvidence("")).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
