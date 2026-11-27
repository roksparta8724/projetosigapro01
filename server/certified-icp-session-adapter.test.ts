import {describe,it,expect,vi,beforeEach} from "vitest";
import {createHmac} from "node:crypto";
import {beginIcpSandboxSession,bindIcpSandboxSession,recordIcpSandboxArchive} from "./certified-icp-session-adapter";
import {callDataApiRpc,readBearer,readEnv,type ApiReq} from "./municipal-storage";
vi.mock("./municipal-storage",()=>({callDataApiRpc:vi.fn(),readBearer:vi.fn(),readEnv:vi.fn()}));
const municipalityId="11111111-1111-4111-8111-111111111111",profileId="22222222-2222-4222-8222-222222222222";
const binding={state:"a".repeat(43),municipalityId,profileId,preparedPdfSha256:"c".repeat(64),byteRangeSha256:"d".repeat(64)};
const start={...binding,snapshotSha256:"e".repeat(64),nonce:"b".repeat(43),processId:"33333333-3333-4333-8333-333333333333",requestId:"44444444-4444-4444-8444-444444444444",artifactType:"construction_permit" as const,signerSlot:"diretoria" as const};
const session={...start,mode:"icp_brasil" as const,environment:"sandbox" as const};
const req={headers:{authorization:"Bearer fictional"}} as ApiReq;
const ok=(payload:unknown)=>({ok:true,status:200,payload,error:""});
beforeEach(()=>{vi.resetAllMocks();vi.mocked(readBearer).mockReturnValue("fictional");vi.mocked(readEnv).mockReturnValue("1".repeat(64));});
describe("ICP sandbox authenticated session adapter",()=>{
 it("sends domain-separated proof and requires a confirmed sandbox start",async()=>{
  vi.mocked(callDataApiRpc).mockResolvedValueOnce(ok({ok:true,environment:"sandbox",issuanceAuthorized:false}));
  await expect(beginIcpSandboxSession(req,start)).resolves.toEqual({ok:true});
  const [,rpc,args]=vi.mocked(callDataApiRpc).mock.calls[0];
  expect(rpc).toBe("certified_icp_session_command_v1");
  const key=createHmac("sha256",Buffer.from("1".repeat(64),"hex")).update("sigapro-certified-session-domain-v1").digest();
  expect(args._mac).toBe(createHmac("sha256",key).update(["sigapro-certified-session-v1",municipalityId,"begin",args._payload,args._epoch].join("\n")).digest("hex"));
 });
 it("rechecks authority after one-use consumption and rejects a different request",async()=>{
  vi.mocked(callDataApiRpc).mockResolvedValueOnce(ok(session)).mockResolvedValueOnce(ok({municipalityId,profileId,cpf:"synthetic-test-identity"}));
  const adapter=bindIcpSandboxSession(req,binding);
  await expect(adapter.reauthorizeSigner(session)).rejects.toThrow("ITI_SESSION_BINDING_MISMATCH");
  await expect(adapter.consumeSession(binding)).resolves.toMatchObject({requestId:start.requestId});
  await expect(adapter.consumeSession(binding)).rejects.toThrow("ITI_SESSION_BINDING_MISMATCH");
  await expect(adapter.reauthorizeSigner({...session,requestId:municipalityId})).rejects.toThrow("ITI_SESSION_BINDING_MISMATCH");
  await expect(adapter.reauthorizeSigner(session)).resolves.toMatchObject({profileId});
  expect(callDataApiRpc).toHaveBeenCalledTimes(2);
 });
 it("requires the exact archive manifest confirmation",async()=>{
  const archive={objectKey:"sandbox-only/test.pdf",sha256:"a".repeat(64),fileSizeBytes:120,byteRangeSha256:binding.byteRangeSha256,cmsSha256:"b".repeat(64),certificateSha256:"c".repeat(64),environment:"sandbox" as const,archiveVerified:true as const,pdfPolicyVerified:false as const,issuanceAuthorized:false as const};
  vi.mocked(callDataApiRpc).mockResolvedValueOnce(ok({...archive,manifestRecorded:true})).mockResolvedValueOnce(ok({...archive,manifestRecorded:true,sha256:"f".repeat(64)}));
  await expect(recordIcpSandboxArchive(req,binding,archive)).resolves.toMatchObject({manifestRecorded:true});
  await expect(recordIcpSandboxArchive(req,binding,archive)).rejects.toThrow("ITI_ARCHIVE_MANIFEST_NOT_CONFIRMED");
 });
 it("fails closed for absent authentication or mismatched returned identity",async()=>{
  vi.mocked(readBearer).mockReturnValueOnce("");
  await expect(beginIcpSandboxSession(req,start)).rejects.toThrow("ITI_AUTHENTICATION_REQUIRED");
  expect(callDataApiRpc).not.toHaveBeenCalled();
  vi.mocked(callDataApiRpc).mockResolvedValueOnce(ok({...session,municipalityId:profileId}));
  await expect(bindIcpSandboxSession(req,binding).consumeSession(binding)).rejects.toThrow("ITI_SESSION_BINDING_MISMATCH");
 });
});
