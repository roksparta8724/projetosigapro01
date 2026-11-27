import {describe,it,expect} from "vitest";
import {encryptItiCredentials,decryptItiCredentials,publicItiConfigStatus,registeredItiCallback,stageItiCredentials,bindRegisteredItiCallback} from "./municipal-iti-sandbox-config";
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

describe("Registered ITI callback",()=>{
 it("reports the canonical callback independently of a transient preview URL",()=>{
  const configured={...env,SIGAPRO_QA_ICP_REDIRECT_URI:config.redirectUri};
  expect(registeredItiCallback(configured)).toBe(config.redirectUri);
  expect(publicItiConfigStatus({configured:false},configured)).toMatchObject({registeredCallback:config.redirectUri,issuanceAuthorized:false});
 });
 it.each(["", "http://qa.example.invalid/api/certified-icp-sandbox", "https://qa.example.invalid/wrong", config.redirectUri+"?code=secret", config.redirectUri+"#fragment","https://user:pass@qa.example.invalid/api/certified-icp-sandbox","https://qa.example.invalid:8443/api/certified-icp-sandbox"] )("rejects invalid callback %s",redirect=>{
  expect(registeredItiCallback({...env,SIGAPRO_QA_ICP_REDIRECT_URI:redirect})).toBeNull();
 });
});

describe("Provisioning before external integration is available",()=>{
 const staged={...config,redirectUri:""};
 const registered={...env,SIGAPRO_QA_ICP_REDIRECT_URI:config.redirectUri};
 it("accepts and encrypts a draft without callback, but never authorizes OAuth",()=>{
  const draft=stageItiCredentials(staged,env);
  expect(decryptItiCredentials(config.municipalityId,encryptItiCredentials(draft,env),env)).toEqual(staged);
  expect(()=>bindRegisteredItiCallback(draft,env)).toThrow("ITI_REDIRECT_NOT_REGISTERED");
  expect(publicItiConfigStatus({configured:true},env)).toMatchObject({configured:true,registeredCallback:null,runtimeEnabled:false,issuanceAuthorized:false});
 });
 it("uses only the canonical server callback after provisioning",()=>{
  expect(bindRegisteredItiCallback(staged,registered)).toEqual(config);
  expect(()=>stageItiCredentials(config,env)).toThrow();
  expect(()=>stageItiCredentials({...config,redirectUri:"https://other.example.invalid/api/certified-icp-sandbox"},registered)).toThrow();
  expect(()=>bindRegisteredItiCallback(config,{...env,SIGAPRO_QA_ICP_REDIRECT_URI:"https://other.example.invalid/api/certified-icp-sandbox"})).toThrow();
 });
 it("does not label mismatched trust material configured",()=>{
  expect(publicItiConfigStatus({configured:true},{...registered,SIGAPRO_QA_ICP_ROOTS_PEM:"invalid",SIGAPRO_QA_ICP_ROOTS_SHA256:"a".repeat(64),SIGAPRO_QA_ICP_CRLS_PEM:"-----BEGIN X509 CRL-----"}).trustConfigured).toBe(false);
 });
});
