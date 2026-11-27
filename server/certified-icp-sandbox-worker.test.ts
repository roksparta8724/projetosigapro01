import {describe,it,expect,vi,beforeEach} from "vitest";
import {completeIcpSandboxCandidate,type IcpSandboxWorkerDependencies} from "./certified-icp-sandbox-worker";
import {exchangeItiSandboxCode,readItiSandboxCertificate,requestItiSandboxPkcs7} from "./iti-signature-sandbox";
import {assertIcpPersonCertificateIdentity,verifySandboxIcpPersonCms} from "./certified-cms-preflight";
import {createHash} from "node:crypto";
import type {PreparedSignatureRange} from "./certified-pdf-byte-range";
vi.mock("./iti-signature-sandbox",()=>({exchangeItiSandboxCode:vi.fn(),readItiSandboxCertificate:vi.fn(),requestItiSandboxPkcs7:vi.fn()}));
vi.mock("./certified-cms-preflight",()=>({assertIcpPersonCertificateIdentity:vi.fn(),verifySandboxIcpPersonCms:vi.fn()}));
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const city="11111111-1111-4111-8111-111111111111",profile="22222222-2222-4222-8222-222222222222";
const head="%PDF-1.7\n1 0 obj\n<< /Type /Sig /ByteRange [0000000000 0000000000 0000000000 0000000000] /Contents ";
const tail=" >>\nendobj\n%%EOF\n";
const range:PreparedSignatureRange=[0,head.length,head.length+4098,tail.length];
const pdf=Buffer.from(head.replace("0000000000 0000000000 0000000000 0000000000",range.map(n=>String(n).padStart(10,"0")).join(" "))+"<"+"0".repeat(4096)+">"+tail);
const rangeSha=sha(Buffer.concat([pdf.subarray(0,range[1]),pdf.subarray(range[2])]));
const request={state:"a".repeat(43),code:"fake-code",municipalityId:city,profileId:profile,preparedPdfSha256:sha(pdf),byteRangeSha256:rangeSha};
const session={municipalityId:city,profileId:profile,processId:"33333333-3333-4333-8333-333333333333",requestId:"44444444-4444-4444-8444-444444444444",artifactType:"construction_permit" as const,signerSlot:"diretoria" as const,mode:"icp_brasil" as const,environment:"sandbox" as const,preparedPdfSha256:sha(pdf),byteRangeSha256:rangeSha};
function deps(){
 return {consumeSession:vi.fn(async()=>session),reauthorizeSigner:vi.fn(async()=>({profileId:profile,municipalityId:city,cpf:"52998224725"})),
 readPreparedPdf:vi.fn(async()=>({bytes:pdf,range})),readMunicipalSandboxConfig:vi.fn(async()=>({municipalityId:city,clientId:"test",clientSecret:"fake-secret",redirectUri:"https://example.gov.br/callback"})),
 readTrustBundle:vi.fn(async()=>({mode:"icp_brasil" as const,environment:"sandbox" as const,rootsPem:"test",rootsSha256:"a".repeat(64),intermediatesPem:"",crlsPem:"test"}))} satisfies IcpSandboxWorkerDependencies;
}
beforeEach(()=>{
 vi.resetAllMocks();vi.mocked(exchangeItiSandboxCode).mockResolvedValue("fake-token");
 vi.mocked(readItiSandboxCertificate).mockResolvedValue("fake-certificate");
 vi.mocked(requestItiSandboxPkcs7).mockResolvedValue(Buffer.alloc(32,0x30));
 vi.mocked(assertIcpPersonCertificateIdentity).mockReturnValue({certificateSha256:"a".repeat(64),identityVerified:true});
 vi.mocked(verifySandboxIcpPersonCms).mockReturnValue({certificateSha256:"a".repeat(64),identityVerified:true,cryptographicPreflightPassed:true,pdfPolicyVerified:false,issuanceAuthorized:false,environment:"sandbox",mode:"icp_brasil",coveredBytesSha256:rangeSha,cmsSha256:"b".repeat(64)});
});
describe("ICP sandbox callback candidate orchestration",()=>{
 it("consumes one session and checks document, identity, CMS and renewed authority; never issues",async()=>{
  const d=deps();const result=await completeIcpSandboxCandidate(d,request);
  expect(d.consumeSession).toHaveBeenCalledOnce();expect(d.reauthorizeSigner).toHaveBeenCalledTimes(2);
  expect(requestItiSandboxPkcs7).toHaveBeenCalledWith("fake-token",Buffer.from(rangeSha,"hex"));
  expect(result).toMatchObject({identityVerified:true,cryptographicPreflightPassed:true,pdfPolicyVerified:false,issuanceAuthorized:false});
  expect(result.sha256).not.toBe(request.preparedPdfSha256);
  expect(JSON.stringify(result)).not.toContain("52998224725");
 });
 it("does not call ITI for a consumed state, wrong tenant or altered prepared PDF",async()=>{
  const consumed=deps();consumed.consumeSession.mockRejectedValueOnce(Error("already consumed"));
  await expect(completeIcpSandboxCandidate(consumed,request)).rejects.toThrow("already consumed");
  const foreign=deps();foreign.consumeSession.mockResolvedValueOnce({...session,municipalityId:profile});
  await expect(completeIcpSandboxCandidate(foreign,request)).rejects.toThrow("ITI_SESSION_BINDING_MISMATCH");
  const altered=deps();const bytes=Buffer.from(pdf);bytes[10]^=1;altered.readPreparedPdf.mockResolvedValueOnce({bytes,range});
  await expect(completeIcpSandboxCandidate(altered,request)).rejects.toThrow("PDF_PREPARED_HASH_MISMATCH");
  expect(exchangeItiSandboxCode).not.toHaveBeenCalled();
 });
 it("does not request a signature when certificate identity differs and rejects revoked authority",async()=>{
  vi.mocked(assertIcpPersonCertificateIdentity).mockImplementationOnce(()=>{throw Error("CMS_CERT_IDENTITY_MISMATCH")});
  await expect(completeIcpSandboxCandidate(deps(),request)).rejects.toThrow("CMS_CERT_IDENTITY_MISMATCH");
  expect(requestItiSandboxPkcs7).not.toHaveBeenCalled();
  const d=deps();d.reauthorizeSigner.mockResolvedValueOnce({profileId:profile,municipalityId:city,cpf:"52998224725"}).mockRejectedValueOnce(Error("revoked authority"));
  await expect(completeIcpSandboxCandidate(d,request)).rejects.toThrow("revoked authority");
 });
});
