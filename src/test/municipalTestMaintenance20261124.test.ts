import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const sql=readFileSync("neon/migrations/20261124_municipal_test_maintenance_v1.sql","utf8");
const ui=readFileSync("src/components/platform/MunicipalMaintenancePanel.tsx","utf8");
describe("Municipal test maintenance safety",()=>{
  it("keeps scope, owner authorization, private snapshot and permanent DAM guard",()=>{
    expect(sql).toContain("public.current_role_code()");
    expect(sql).toContain("('master_admin','admin_master')");
    expect(sql).toContain("REVOKE ALL ON private.municipal_test_maintenance_backups_v1");
    expect(sql).toContain("_old.snapshot IS DISTINCT FROM _snapshot");
    expect(sql).toContain("_protected=0 AND _external=0 AND _legacy=0");
    expect(sql).toContain("_municipality.status IN ('blocked','inactive')");
    expect(sql).toContain("AND tenant_id=_municipality_id AND municipality_id=_municipality_id");
    expect(sql).not.toMatch(/DISABLE TRIGGER|TRUNCATE|DELETE FROM public\.tenants|DELETE FROM public\.tenant_protocol_counters/i);
  });
  it("requires confirmed backend result and exact phrase",()=>{
    expect(ui).toContain("confirmation!==phrase");
    expect(ui).toContain("row.reset_done !== true");
    expect(ui).toContain("row.municipality_id !== institution.id");
    expect(ui).toContain("Arquivos externos não foram copiados");
  });
});


it("locks existing/activated municipalities and never reopens commercial operation for reset",()=>{
  expect(sql).toContain("SELECT id,'producao_protegida',now() FROM public.municipalities");
  expect(sql).toContain("_mode='homologacao' AND _municipality.status");
  expect(sql).toContain("Conclua a limpeza dos testes antes da ativação comercial.");
  expect(sql).toContain("SET mode='producao_protegida',sealed_at=now()");
  expect(ui).toContain("data-maintenance-mode={result.lifecycle_mode}");
});
it("keeps all maintenance UI states on explicit contrasting tokens",()=>{
 const css=readFileSync("src/styles/sigapro-master-workspace-premium-20261124.css","utf8");
 expect(css).toContain("--mm-ink:#f3faff");
 expect(css).toContain("--mm-warning-ink:#ffe6ae");
 expect(css).toContain("--mm-error-ink:#ffd8e1");
 expect(css).toContain('[data-maintenance-field]):focus-visible');
 expect(ui).toContain('data-maintenance-action="danger"');
});
