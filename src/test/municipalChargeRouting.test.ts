import {describe,expect,it} from "vitest";
import {resolveMunicipalChargeRoute,municipalChargeRouteMessage} from "../lib/municipalChargeRouting";
const mp={provider:"mercado_pago",status:"active",environment:"production"};
describe("Municipal bank routing (never fall back to MP)",()=>{
 it("uses Mercado Pago only for its explicitly active municipal connection",()=>{
  expect(resolveMunicipalChargeRoute({collection_mode_snapshot:"sigapro"},mp,null)).toBe("mercado_pago");
 });
 it("accepts any separately registered bank, without inventing an API",()=>{
  for(const provider of ["bank_direct","manual"]){
   const result=resolveMunicipalChargeRoute({collection_mode_snapshot:"sigapro"}, {provider,status:"active",environment:"production"},null);
   expect(result).toBe(provider);
   expect(municipalChargeRouteMessage(result)).toContain("Mercado Pago");
  }
 });
 it("preserves the issued municipality's document mode after later changes",()=>{
  expect(resolveMunicipalChargeRoute({collection_mode_snapshot:"municipal_system"},mp,null)).toBe("municipal_system");
  expect(resolveMunicipalChargeRoute({},mp,{mode:"municipal_system",status:"active"})).toBe("municipal_system");
  expect(resolveMunicipalChargeRoute({collection_mode_snapshot:"sigapro"},mp,{mode:"municipal_system",status:"active"})).toBe("mercado_pago");
 });
 it("never overwrites the immutable provider on an old guide",()=>{
  expect(resolveMunicipalChargeRoute({payment_provider:"bank_direct",bank_reference:"FOREIGN123"},mp,null)).toBe("bank_direct");
  expect(resolveMunicipalChargeRoute({bank_reference:"UNKNOWN123"},mp,null)).toBe("provider_mismatch");
  expect(resolveMunicipalChargeRoute({payment_provider:"mercado_pago",provider_environment:"test",bank_reference:"ORDER123"},mp,null)).toBe("provider_mismatch");
 });
 it("blocks unconfigured providers and inactive bank connections",()=>{
  expect(resolveMunicipalChargeRoute({},null,null)).toBe("unconfigured");
  expect(resolveMunicipalChargeRoute({}, {provider:"mercado_pago",status:"configured"},null)).toBe("unconfigured");
 });
});
