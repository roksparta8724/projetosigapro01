import {describe,it,expect} from "vitest";
import {encryptItiCredentials,decryptItiCredentials,publicItiConfigStatus} from "./municipal-iti-sandbox-config";
const env={SIGAPRO_BANK_CHARGE_SIGNING_SECRET:"a".repeat(64)};
const config={municipalityId:"11111111-1111-4111-8111-111111111111",clientId:"fixture-id",clientSecret:"fixture-secret",redirectUri:"https://qa.example.invalid/api/certified-icp-sandbox"};
describe("Municipal ITI credential vault",()=>{
 it("encrypts separately by tenant and rejects altered credentials",()=>{
  const encrypted=encryptItiCredentials(config,env);
  expect(encrypted).not.toContain(config.clientSecret);
  expect(decryptItiCredentials(config.municipalityId,encrypted,env)).toEqual(config);
  expect(()=>decryptItiCredentials("22222222-2222-4222-8222-222222222222",encrypted,env)).toThrow();
  expect(()=>decryptItiCredentials(config.municipalityId,encrypted,{SIGAPRO_BANK_CHARGE_SIGNING_SECRET:"b".repeat(64)})).toThrow();
 });
 it("does not expose ciphertext or claim issuance readiness",()=>{
  const result=publicItiConfigStatus({configured:true,ciphertext:"not-for-browser"},env);
  expect(result).toMatchObject({configured:true,archiveConfigured:false,trustConfigured:false,issuanceAuthorized:false});
  expect(result).not.toHaveProperty("ciphertext");
 });
});
