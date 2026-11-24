import {readFileSync} from "node:fs";
import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("@/integrations/backend/databaseClient",()=>({backendClient:{rpc:vi.fn()}}));
import {backendClient} from "@/integrations/backend/databaseClient";
import {completeHabiteSeProcess,getHabiteSePermit,setHabiteSePermitAwaitingDirector,finalizeHabiteSePermit} from "@/integrations/permits/habiteSePermitClient";

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
 it("administrador municipal é somente leitura também na tela do Alvará",()=>{
  expect(panel).toContain('const isReadOnlyMunicipalAdmin = ["prefeitura_admin", "admin_prefeitura", "admin_municipality"]');
  expect(panel).toContain("const canManage = canManageFromServer && !isReadOnlyMunicipalAdmin;");
  expect(panel).toContain("const canCloseProcess =");
  expect(panel).toContain("!isReadOnlyMunicipalAdmin && (");
  expect(panel).not.toContain('["prefeitura_admin", "prefeitura_supervisor", "master_admin", "master_ops"]');
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


describe("Habite-se — confirmação estrita do processo e estado",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("não presume o arquivamento com retorno parcial ou de outro processo",async()=>{
  for(const data of [{ok:true},{ok:true,process_id:"qa"},{ok:true,status:"arquivado"},{ok:true,process_id:"outro",status:"arquivado"},{ok:true,process_id:"qa",status:"deferido"},{ok:"true",process_id:"qa",status:"arquivado"}]){
   vi.mocked(backendClient.rpc).mockResolvedValueOnce({data,error:null});
   await expect(completeHabiteSeProcess("qa")).rejects.toThrow("banco não confirmou");
  }
 });
 it("não aceita alvará de outro processo ou etapa divergente",async()=>{
  const permit={id:"permit-qa",process_id:"outro",permit_number:"QA",status:"emitido"};
  vi.mocked(backendClient.rpc).mockResolvedValueOnce({data:{permit},error:null});
  await expect(getHabiteSePermit("qa")).rejects.toThrow("incompatível");
  vi.mocked(backendClient.rpc).mockResolvedValueOnce({data:{permit:{...permit,process_id:"qa",status:"rascunho"}},error:null});
  await expect(setHabiteSePermitAwaitingDirector("qa")).rejects.toThrow("não confirmou");
  vi.mocked(backendClient.rpc).mockResolvedValueOnce({data:{permit:{...permit,process_id:"qa",status:"aguardando_diretor"}},error:null});
  await expect(finalizeHabiteSePermit("qa")).rejects.toThrow("não confirmou");
 });
});
