import {afterEach,describe,expect,it,vi} from "vitest";
import {municipalPaymentSetupProof,assertProductionMunicipalSetupRuntime} from "../../server/municipal-payment-setup-proof";
import {testMercadoPagoToken} from "../../server/municipal-payment";
const city="49dac0b6-6352-4744-9aab-9ff91c59d970";
const config={municipality_id:city,provider:"mercado_pago",environment:"production",credentials_ciphertext:"synthetic-a",webhook_secret_ciphertext:"synthetic-b"} as const;
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
describe("municipal setup evidence",()=>{
 it("binds server evidence to operation, tenant and exact encrypted credentials",()=>{
  vi.stubEnv("SIGAPRO_BANK_CHARGE_SIGNING_SECRET","a".repeat(64));
  const now=1700000000000;
  const p=municipalPaymentSetupProof(config,city,"test",true,true,false,now);
  expect(p._mac).toMatch(/^[a-f0-9]{64}$/);
  expect(municipalPaymentSetupProof({...config,credentials_ciphertext:"new"},city,"test",true,true,false,now)._mac).not.toBe(p._mac);
  expect(municipalPaymentSetupProof(config,city,"activate",true,false,false,now)._mac).not.toBe(p._mac);
  expect(()=>municipalPaymentSetupProof(config,"other","test",true,true,false,now)).toThrow();
  expect(JSON.stringify(p)).not.toContain("synthetic-a");
 });
 it("never accepts a production setup on preview",()=>{
  expect(()=>assertProductionMunicipalSetupRuntime({VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"main"})).toThrow();
  expect(()=>assertProductionMunicipalSetupRuntime({VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:"main"})).not.toThrow();
 });
 it("rejects an invalid response or unavailable payment methods",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:200})));
  await expect(testMercadoPagoToken("synthetic")).rejects.toThrow();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify([{id:"visa"}]),{status:200})));
  await expect(testMercadoPagoToken("synthetic")).rejects.toThrow();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify([{id:"pix"}]),{status:200})));
  expect(await testMercadoPagoToken("synthetic")).toMatchObject({pixAvailable:true,boletoAvailable:false});
 });
});
