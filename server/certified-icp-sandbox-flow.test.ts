import {describe,it,expect} from "vitest";
import {createSandboxEvidencePdf,sealSandboxTicket,openSandboxTicket} from "./certified-icp-sandbox-flow";
import {inspectPreparedPdfSignature} from "./certified-pdf-byte-range";
const selection={municipalityId:"11111111-1111-4111-8111-111111111111",profileId:"22222222-2222-4222-8222-222222222222",processId:"33333333-3333-4333-8333-333333333333",requestId:"44444444-4444-4444-8444-444444444444",artifactType:"construction_permit" as const,signerSlot:"diretoria" as const};
const env={SIGAPRO_BANK_CHARGE_SIGNING_SECRET:"a".repeat(64)};
describe("Sandbox HTTP document binding",()=>{
 it("generates deterministic nonofficial PDF bytes and binds the persisted snapshot",()=>{
  const a=createSandboxEvidencePdf(selection,"b".repeat(64),"c".repeat(43));
  const b=createSandboxEvidencePdf(selection,"b".repeat(64),"c".repeat(43));
  expect(a.bytes).toEqual(b.bytes);expect(a.bytes.toString()).toContain("SEM VALIDADE DE ALVARA");
  expect(inspectPreparedPdfSignature(a.bytes,a.range,a.preparedPdfSha256).byteRangeSha256).toBe(a.byteRangeSha256);
  expect(createSandboxEvidencePdf(selection,"d".repeat(64),"c".repeat(43)).preparedPdfSha256).not.toBe(a.preparedPdfSha256);
 });
 it("rejects altered or expired tickets and uses separate server attestation domain",()=>{
  const now=Date.now(),ticket={...selection,state:"c".repeat(43),snapshotSha256:"b".repeat(64),preparedPdfSha256:"e".repeat(64),byteRangeSha256:"f".repeat(64),expiresAt:now+200000};
  const sealed=sealSandboxTicket(ticket,env);
  expect(openSandboxTicket(sealed,env,now)).toEqual(ticket);
  expect(()=>openSandboxTicket(sealed.slice(0,-1)+(sealed.endsWith("a")?"b":"a"),env,now)).toThrow();
  expect(()=>openSandboxTicket(sealed,env,now+200001)).toThrow();
  expect(()=>openSandboxTicket(sealed,{SIGAPRO_BANK_CHARGE_SIGNING_SECRET:"b".repeat(64)},now)).toThrow();
 });
});
