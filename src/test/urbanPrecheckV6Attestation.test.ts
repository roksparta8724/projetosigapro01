import { beforeEach,describe,expect,it,vi } from "vitest";
const stubs = vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/backend/databaseClient",()=>({backendClient:{rpc:stubs.rpc}}));
import { saveUrbanPrecheckRun } from "@/integrations/backend/urbanPrecheckClient";
const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const processId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const versionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sample = {front_setback_m:{value:5.3,evidence:"Prancha 01, implantação"}};
const review = {evidenceIds:[uuid],note:"Conferi a norma aplicável ao imóvel, o projeto e todas as exceções.",documentScopeConfirmed:true};
describe("SIGAPRO urban precheck v7: verified geometry and authenticated legal scope",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it("refuses empty scopes, duplicate IDs, missing attestation and short reviewer notes",async()=>{
    await expect(saveUrbanPrecheckRun(processId,versionId,"2026-11-04",sample,uuid,
      {...review,evidenceIds:[]})).rejects.toThrow(/Confirme cada fonte legal/);
    await expect(saveUrbanPrecheckRun(processId,versionId,"2026-11-04",sample,uuid,
      {...review,evidenceIds:[uuid,uuid]})).rejects.toThrow(/Confirme cada fonte legal/);
    await expect(saveUrbanPrecheckRun(processId,versionId,"2026-11-04",sample,uuid,
      {...review,documentScopeConfirmed:false})).rejects.toThrow(/Confirme cada fonte legal/);
    await expect(saveUrbanPrecheckRun(processId,versionId,"2026-11-04",sample,uuid,
      {...review,note:"OK"})).rejects.toThrow(/Confirme cada fonte legal/);
    expect(stubs.rpc).not.toHaveBeenCalled();
  });
  it("sends the exact verified legal scope to Neon v7 and checks the advisory receipt",async()=>{
    stubs.rpc.mockResolvedValue({data:{id:uuid,status:"advisory",signed:false},error:null});
    await saveUrbanPrecheckRun(processId,versionId,"2026-11-04",sample,uuid,review);
    expect(stubs.rpc).toHaveBeenCalledExactlyOnceWith("save_urban_precheck_run_v7",{
      _process_id:processId,_regulation_version_id:versionId,
      _reference_date:"2026-11-04",_measurements:sample,
      _legal_review:{evidence_ids:[uuid],note:review.note,document_scope_confirmed:true},
      _request_id:uuid,
    });
  });
  it("does not claim recorded if the writer returns a malformed or unsigned receipt",async()=>{
    stubs.rpc.mockResolvedValue({data:{status:"ok"},error:null});
    await expect(saveUrbanPrecheckRun(processId,versionId,"2026-11-04",sample,uuid,review))
      .rejects.toThrow(/Neon não confirmou/);
  });
});
