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
