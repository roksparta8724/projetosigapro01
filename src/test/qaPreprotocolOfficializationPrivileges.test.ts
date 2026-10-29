import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "neon/migrations/20261025_qa_restrict_internal_preprotocol_officialization_v1.sql",
  "utf8",
);
const source = migration.toLowerCase();

describe("SIGAPRO QA — protocol number issued only after authorized payment confirmation", () => {
  it("rejects every database other than isolated SIGAPRO QA", () => {
    expect(migration).toContain("current_database() <> 'sigapro_migration_stage_20260923'");
    expect(migration).toContain(
      "'public.officialize_preprotocol_v1(uuid,uuid)'",
    );
    expect(source).not.toMatch(/\b(?:drop|truncate|delete from|update public\.processes|insert into)\b/);
  });

  it("confirms both legitimate internal payment paths before revoking direct RPC access", () => {
    expect(migration).toContain("confirm_preprotocol_payment_v1");
    expect(migration).toContain("trg_officialize_preprotocol_after_payment_v1");
    expect(migration).toContain("proowner='neondb_owner'::regrole::oid");
    expect(migration).toContain("count(DISTINCT p.proname)");
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.officialize_preprotocol_v1\(uuid,uuid\)\s+FROM PUBLIC, anonymous, authenticated;/,
    );
  });

  it("preserves the original helper and automatic trigger bodies unchanged", () => {
    expect(source).not.toContain("create or replace function");
    expect(source).not.toContain("grant execute");
    expect(source).toContain("notify pgrst, 'reload schema'");
  });
});
