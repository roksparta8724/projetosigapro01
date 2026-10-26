import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const snapshots=readFileSync("neon/migrations/20261026_prod_collection_guide_snapshot_v1.sql","utf8");
const guard=readFileSync("neon/migrations/20261026_prod_dam_collection_mode_guard_v1.sql","utf8");
const inventory=readFileSync("scripts/production-release-preflight.mjs","utf8");

describe("production candidate: preserve historical collections and prevent parallel billing",()=>{
  it("records mode/provider/config version at INSERT without backfilling issued guides",()=>{
    for(const name of ["collection_configuration_id","collection_mode_snapshot",
      "collection_provider_snapshot","collection_configuration_version",
      "collection_capabilities_snapshot","collection_public_parameters_snapshot"]) {
      expect(snapshots).toContain("ADD COLUMN IF NOT EXISTS");
      expect(snapshots).toContain(name);
    }
    expect(snapshots).toContain("BEFORE INSERT ON public.payment_guides");
    expect(snapshots).toContain("NEW.collection_mode_snapshot := active_config.mode");
    expect(snapshots).toContain("NEW.collection_configuration_version := active_config.version");
    expect(snapshots).not.toMatch(/\bUPDATE\s+public\.payment_guides\b/i);
    expect(snapshots).not.toMatch(/\bDELETE\s+FROM\s+public\.payment_guides\b/i);
    expect(snapshots).not.toMatch(/\bTRUNCATE\b/i);
  });
  it("never allows a second bank charge on a municipal-system guide or legacy ambiguous mode",()=>{
    expect(guard).toContain("CREATE OR REPLACE FUNCTION public.assert_dam_writer_v1");
    expect(guard).toContain("_guide.collection_mode_snapshot");
    expect(guard).toContain("active' AND c.mode = 'municipal_system'");
    expect(guard).toContain("_guide.collection_mode_snapshot IS NULL");
    expect(guard).toContain("public.has_tenant_access(_guide.municipality_id)");
    expect(guard).toContain("public.has_process_access(_guide.process_id)");
    expect(guard).toContain("public.is_internal_municipality_role()");
    expect(guard).toContain("public.current_role_code(),'') = 'profissional_externo'");
    expect(guard).toContain("_guide.guide_kind = 'protocolo'");
    expect(guard).toContain("pr.created_by_profile_id = actor");
    expect(guard).toContain("pr.municipality_id = _guide.municipality_id");
    expect(guard).toContain("pr.officialized_at IS NULL");
    expect(guard).not.toMatch(/\bUPDATE\s+public\.payment_guides\b/i);
  });
  it("orders additive columns before first DAM RPC and installs the final mode guard last",()=>{
    const a=inventory.indexOf("20261026_prod_collection_guide_snapshot_v1.sql");
    const b=inventory.indexOf("20261021_dam_original_and_provider_persistence.sql");
    const c=inventory.indexOf("20261026_dam_boleto_optional_pix_fix.sql");
    const d=inventory.indexOf("20261026_prod_dam_collection_mode_guard_v1.sql");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
    expect(guard).toContain("REVOKE ALL ON FUNCTION public.assert_dam_writer_v1");
  });
});
