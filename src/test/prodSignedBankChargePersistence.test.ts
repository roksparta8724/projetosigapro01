import {createHmac} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("../../server/municipal-storage.js",async importOriginal=>{
  const original=await importOriginal<typeof import("../../server/municipal-storage")>();
  return {...original,callDataApiRpc:mock.rpc};
});
import {assertBankChargeAttestationReady,persistGuideCharge,signVerifiedBankCharge} from "../../server/guide-persistence";
const guide={
 id:"d7ed37ab-fba5-49eb-9120-6830c6ff3469",
 municipality_id:"0bb6227b-5917-42e6-a320-1410b1a6fdd4",
 process_id:"031d0418-8b44-4bd8-a3b5-ff8855a9fdf8",
 guide_number:"SIGAPRO-QA-TEST-01",amount:1,
 due_date:"2026-10-30",created_at:"2026-10-29",status:"pending",
};
const charge={ok:true,environment:"test" as const,orderId:"ORD01HQUALTEST789",
 externalReference:guide.guide_number,amount:"1.00",
 paymentId:"PAY01HQUALTEST789",status:"action_required",statusDetail:"waiting_payment",
 barcodeContent:"1".repeat(44),digitableLine:"1".repeat(47),ticketUrl:"https://www.mercadopago.com.br/receipt/test"};
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();mock.rpc.mockReset()});
describe("server-authenticated municipal bank charge persistence",()=>{
 it("fails closed when signing key is missing or malformed",()=>{
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","");
  expect(()=>assertBankChargeAttestationReady()).toThrow(/Assinatura bancária/);
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","test");
  expect(()=>assertBankChargeAttestationReady()).toThrow(/Assinatura bancária/);
 });
 it("signs precise SQL receipt contract with authenticated guide and provider cents",()=>{
  const secret="ab".repeat(32);
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET",secret);
  const signed=signVerifiedBankCharge(guide,charge);
  const stamp=String(signed.__receipt_epoch);
  expect(stamp).toMatch(/^[0-9]{10,11}$/);
  const fields=["sigapro-charge-v1",guide.municipality_id,guide.guide_number,
    charge.externalReference,charge.amount,charge.orderId,charge.environment,charge.paymentId,
    charge.status,charge.statusDetail,"",charge.barcodeContent,charge.digitableLine,charge.ticketUrl,stamp];
  const expected=createHmac("sha256",Buffer.from(secret,"hex")).update(fields.join("\n"),"utf8").digest("hex");
  expect(signed.__receipt_mac).toBe(expected);
  expect(JSON.stringify(signed)).not.toContain(secret);
 });
 it("does not sign mismatched guides, unverified provider response or control-character injection",()=>{
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","ab".repeat(32));
  expect(()=>signVerifiedBankCharge(guide,{...charge,amount:"1.01"})).toThrow();
  expect(()=>signVerifiedBankCharge(guide,{...charge,externalReference:"other"})).toThrow();
  expect(()=>signVerifiedBankCharge(guide,{...charge,ok:false})).toThrow();
  expect(()=>signVerifiedBankCharge(guide,{...charge,ticketUrl:"https://safe.test/\nspoof"})).toThrow();
 });
 it("sends signed bank reply only to the audited Neon v2 RPC",async()=>{
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","ab".repeat(32));
  mock.rpc.mockResolvedValue({ok:true,status:200,payload:{
    ...guide,bank_reference:charge.orderId,payment_provider:"mercado_pago",provider_environment:"test"
  }});
  await persistGuideCharge({headers:{authorization:"Bearer demo"}} as never,guide,charge,false);
  expect(mock.rpc).toHaveBeenCalledTimes(1);
  expect(mock.rpc).toHaveBeenCalledWith(expect.anything(),"persist_payment_guide_provider_charge_v2",expect.objectContaining({
    _municipality_id:guide.municipality_id,_guide_code:guide.guide_number,
    _charge:expect.objectContaining({__receipt_mac:expect.stringMatching(/^[a-f0-9]{64}$/),__receipt_epoch:expect.any(String)})
  }));
 });
 it("keeps isolated QA persistence separate from the production signing contract",async()=>{
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","");
  mock.rpc.mockResolvedValue({ok:true,status:200,payload:{
    ...guide,bank_reference:charge.orderId,payment_provider:"mercado_pago",provider_environment:"test"
  }});
  await persistGuideCharge({headers:{}} as never,guide,charge,true);
  expect(mock.rpc).toHaveBeenCalledWith(expect.anything(),"qa_persist_payment_guide_provider_charge_v1",
    expect.objectContaining({_charge:charge}));
 });
});
