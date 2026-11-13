import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { canEditUrbanLegislationManagement } from "@/lib/urbanLegislationAccess";
const read=(p:string)=>readFileSync(p,"utf8");
describe("Legislation responsibility per Prefeitura",()=>{
 it("only municipal administrator may edit official legislation",()=>{
  expect(canEditUrbanLegislationManagement("prefeitura_admin")).toBe(true);
  for(const role of ["master_admin","master_ops","prefeitura_supervisor","analista","financeiro"] as const)expect(canEditUrbanLegislationManagement(role)).toBe(false);
  expect(read("src/components/platform/UrbanLegislationRegistryPanel.tsx")).toContain("session.tenantId === municipalityId");
  expect(read("src/pages/saas/ConfiguracoesPage.tsx")).toContain("selectedTenantId === session.tenantId");
 });
 it("requires tenant-bound backend authorization on both upload paths",()=>{
  for(const p of ["server/api/r2-upload.ts","server/api/r2-legal-sign-put.ts"])expect(read(p)).toContain("can_manage_urban_legislation_registry_v1");
  const sql=read("neon/migrations/20261104_urban_legislation_prefeitura_admin_writer_v2.sql");
  expect(sql).toContain("public.has_tenant_access(_municipality_id)");
  expect(sql).toContain("''prefeitura_admin''");
 });
 it("preserves immutable history and limits Admin's operational writes",()=>{
  expect(read("neon/migrations/20261103_urban_legislation_registry_v1.sql")).toContain("ready_for_ai boolean NOT NULL DEFAULT false CHECK(ready_for_ai=false)");
  expect(read("neon/migrations/20261014_prefeitura_admin_readonly_operational_guard.sql")).toContain("if _role_code = 'prefeitura_admin' then");
 });
});
