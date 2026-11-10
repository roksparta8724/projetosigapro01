import {readFileSync} from "node:fs";
import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("@/integrations/backend/databaseClient",()=>({backendClient:{rpc:vi.fn()}}));
import {backendClient} from "@/integrations/backend/databaseClient";
import {completeHabiteSeProcess} from "@/integrations/permits/habiteSePermitClient";

const detail=readFileSync("src/pages/saas/ProcessDetailPage.tsx","utf8");
const panel=readFileSync("src/components/platform/HabiteSePermitPanel.tsx","utf8");
const callback=detail.slice(detail.indexOf("onCompleteProcess={async () => {"),
 detail.indexOf("onReopenProcess={async",detail.indexOf("onCompleteProcess={async () => {")));

describe("Habite-se: conclusão oficial via RPC transacional",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("o botão invoca a função oficial, não altera genericamente para deferido",()=>{
  expect(callback).toContain("completeHabiteSeProcess(process.id)");
  expect(callback).toContain('result.status !== "arquivado"');
  expect(callback).not.toContain("updateProcessStatus(");
  expect(panel).toContain('setLifecycleStatus("arquivado")');
  expect(panel).not.toContain('await onCompleteProcess();\n      setLifecycleStatus("deferido");');
 });
 it("a RPC devolve arquivado para o mesmo processo",async()=>{
  vi.mocked(backendClient.rpc).mockResolvedValueOnce({data:{
    ok:true,process_id:"qa-process-id",status:"arquivado",already_completed:false},error:null});
  const result=await completeHabiteSeProcess("qa-process-id");
  expect(backendClient.rpc).toHaveBeenCalledWith("complete_habite_se_process_v1",{
    _process_id:"qa-process-id",
  });
  expect(result).toEqual({ok:true,alreadyCompleted:false,processId:"qa-process-id",status:"arquivado"});
 });
 it("rejeita a conclusão sem retorno validado pelo banco",async()=>{
  vi.mocked(backendClient.rpc).mockResolvedValueOnce({data:{ok:false},error:null});
  await expect(completeHabiteSeProcess("qa")).rejects.toThrow("banco não confirmou");
  vi.mocked(backendClient.rpc).mockResolvedValueOnce({data:null,error:{message:"Assinatura da Diretoria inválida."}});
  await expect(completeHabiteSeProcess("qa")).rejects.toThrow("Assinatura da Diretoria inválida.");
 });
});
