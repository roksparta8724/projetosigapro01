import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(path,"utf8");
describe("municipal brand and commercial contract separation",()=>{
  it("allows the municipal owner to configure branding but not contract status",()=>{
    const config=read("src/pages/saas/ConfiguracoesPage.tsx");
    const migration=read("neon/migrations/20261123_master_only_contract_status_v1.sql");
    expect(config).toContain('data-contract-status-role={isPlatformContractAdmin ? "master" : "read-only"}');
    expect(config).toContain('readOnly={!isPlatformContractAdmin}');
    expect(config).toContain('tenant?.status ?? tenantForm.status');
    expect(migration).toContain("new.status is distinct from old.status");
    expect(migration).toContain("actor.role in ('admin_master','master_admin')");
  });
  it("does not pretend a scale change is saved before the persisted geometry is confirmed",()=>{
    const config=read("src/pages/saas/ConfiguracoesPage.tsx");
    expect(config).toContain("draftHeaderLogoConfig.scale <= MUNICIPAL_LOGO_FULL_FIT_ZOOM");
    expect(config).toContain("draftFooterLogoConfig.scale <= MUNICIPAL_LOGO_FULL_FIT_ZOOM");
    expect(config).toContain("O banco não confirmou o enquadramento do logo.");
  });
});
