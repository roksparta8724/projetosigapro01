import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {describeMunicipalCollectionAdapter} from "../../server/municipal-collection-adapters";
const read=(path:string)=>readFileSync(path,"utf8");
describe("SIGAPRO - bank connector provisioning must be genuine and municipality isolated",()=>{
 it("does not confuse a catalogue entry with an installed, bank-verified connector",()=>{
  for(const code of ["govbr_ar","santander_033","itau_341","banco_brasil_001"]){
   const v=describeMunicipalCollectionAdapter(code);
   expect(v).toMatchObject({supplierCode:code,connectorInstalled:false,credentialVerified:false,
    bankSettlementEnabled:false,mode:"controlled_import_only",operations:[]});
  }
 });
 it("requires an authorized scoped lookup for provider readiness",()=>{
  const api=read("api/collection-configuration.ts");
  expect(api).toContain('action === "provider_status"');
  expect(api).toContain('await rpc(req, "get_municipal_collection_configuration_v1"');
  expect(api).toContain("describeMunicipalCollectionAdapter(supplierCode)");
 });
 it("blocks selecting automatic mode unless a server connector is installed",()=>{
  const ui=read("src/components/platform/MunicipalCollectionSettings.tsx");
  expect(ui).toContain('data-collection-provider-readiness="true"');
  expect(ui).toContain('disabled={!providerStatus?.connectorInstalled}');
  expect(ui).toContain('providerStatusError');
  expect(ui).toContain('integrationType:"controlled_import"');
  expect(ui).toContain('environment:value as typeof v.environment,secret:""');
 });
 it("SQL must not re-use secrets after supplier, environment, or mode changes",()=>{
  const migration=read("neon/migrations/20261029_municipal_collection_secret_scope_v2.sql");
  expect(migration).toContain("same_scope :=");
  expect(migration).toContain("previous.environment=_environment");
  expect(migration).toContain("previous.supplier_code is not distinct from nullif");
  expect(migration).toContain("when _mode<>'municipal_system' or _integration_type<>'automatic' then null");
  expect(migration).toContain("when same_scope then previous.secret_ciphertext");
  expect(migration).toContain("where m.id=_municipality_id for update");
  expect(migration).not.toContain("coalesce(_secret_ciphertext,previous.secret_ciphertext)");
 });
});
