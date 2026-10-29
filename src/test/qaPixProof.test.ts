import {afterEach,describe,expect,it,vi} from "vitest";
import {createHmac} from "node:crypto";
import {signQaPixProof} from "../../server/qa-mp-pix-proof.js";
afterEach(()=>vi.unstubAllEnvs());
describe("QA PIX server-only proof",()=>{
 it("signs the same canonical data with SHA-256 to match the Neon verifier",()=>{
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","ab".repeat(32));
  const payload={action:"save" as const,municipalityId:"49dac0b6-6352-4744-9aab-9ff91c59d970",
   guideCode:"DAM-PRE-20261027-EXAMPLE",key:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
   amount:12.3,orderId:"ORDABC12345",paymentId:"PAYABC12345",status:"action_required",qrCode:"000201BR.GOV.BCB.PIX6304ABCD"};
  const signed=signQaPixProof(payload);
  const fields=["sigapro-qa-pix-v1","save",payload.municipalityId,payload.guideCode,
   payload.key,"12.30",payload.orderId,payload.paymentId,payload.status,payload.qrCode,String(signed._proof_epoch)];
  const mac=createHmac("sha256",Buffer.from("ab".repeat(32),"hex"))
   .update(fields.join("\n"),"utf8").digest("hex");
  expect(signed._proof_mac).toBe(mac);
 });
 it("rejects missing keys and newline injection",()=>{
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","");
  expect(()=>signQaPixProof({action:"reserve",municipalityId:"test",guideCode:"guide",key:"key",amount:1}))
   .toThrow(/Chave de assinatura/);
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","ab".repeat(32));
  expect(()=>signQaPixProof({action:"save",municipalityId:"test",guideCode:"g\nabc",key:"key",amount:1}))
   .toThrow(/caracteres de controle/);
 });
});