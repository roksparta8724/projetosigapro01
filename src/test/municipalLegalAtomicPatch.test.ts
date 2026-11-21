import { describe,expect,it,vi,beforeEach } from "vitest";
import { readFileSync } from "node:fs";
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/backend/databaseClient",()=>({backendClient:{rpc:mock.rpc}}));
import {saveMunicipalLegacyLegalAssets} from "@/integrations/backend/urbanLegislationRegistryClient";
const read=(p:string)=>readFileSync(p,"utf8");
const tenant="49dac0b6-6352-4744-9aab-9ff91c59d970";
describe("SIGAPRO legacy legal document patch — atomic and municipal",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("sends exactly requested legal slots to one audited RPC",async()=>{
  mock.rpc.mockResolvedValue({data:{ok:true,changed:1},error:null});
  const change={slot:"uso_solo" as const,fileName:"quadros.pdf",
    fileRef:"r2:municipalities/"+tenant+"/legislation-uso-solo/user/77777777-7777-4777-8777-777777777777-quadros.pdf"};
  await expect(saveMunicipalLegacyLegalAssets(tenant,[change],"11111111-1111-4111-8111-111111111111")).resolves.toEqual({ok:true,changed:1});
  expect(mock.rpc).toHaveBeenCalledWith("save_municipal_legacy_legal_assets_v1",{
   _municipality_id:tenant,_changes:[change],_request_id:"11111111-1111-4111-8111-111111111111"
  });
 });
 it("never accepts unconfirmed saves or duplicate slots",async()=>{
  mock.rpc.mockResolvedValue({data:{ok:false},error:null});
  await expect(saveMunicipalLegacyLegalAssets(tenant,[{slot:"zoneamento",fileName:"x.pdf",fileRef:"x"}],"req")).rejects.toThrow("não confirmou");
  expect(mock.rpc).toHaveBeenCalledTimes(1);
  await expect(saveMunicipalLegacyLegalAssets(tenant,[],"req")).rejects.toThrow("Selecione");
  expect(mock.rpc).toHaveBeenCalledTimes(1);
 });
 it("updates only legal JSON keys; preserves all finance and institutional keys",()=>{
  const sql=read("neon/migrations/20261104_municipal_legacy_legal_assets_atomic_v1.sql");
  const page=read("src/pages/saas/ConfiguracoesPage.tsx");
  expect(sql).toContain("FOR UPDATE");
  expect(sql).toContain("general_settings=coalesce(general_settings,'{}'::jsonb)||_delta");
  expect(sql).toContain("municipal_legacy_legal_asset_events_v1");
  expect(sql).toContain("public.current_role_code() IS DISTINCT FROM 'prefeitura_admin'");
  expect(sql).toContain("public.has_tenant_access(_municipality_id)");
  expect(sql).not.toContain("DELETE FROM");
  expect(page).toContain('kind === "legislation"\n            ? saveMunicipalLegacyLegalAssets(');
  expect(page).not.toContain('skipMunicipalityBranding: kind === "legislation"');
  expect(page).toContain("selected[0]?.file");
  expect(page).toContain("stagedLegalUploadsRef.current");
 });
});
