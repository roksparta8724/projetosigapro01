import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "neon/migrations/20261025_qa_disable_legacy_unscoped_payment_rpc_v1.sql",
  "utf8",
);
const endpoint = readFileSync("api/mercadopago.ts", "utf8");
const persistence = readFileSync("server/guide-persistence.ts", "utf8");

describe("SIGAPRO QA — legacy provider RPC cannot modify municipal banking", () => {
  it("refuses non-QA databases and preserves the secure scoped payment routine", () => {
    expect(migration).toContain("current_database() <> 'sigapro_migration_stage_20260923'");
    expect(migration).toContain(
      "'public.persist_payment_guide_provider_charge_v2(uuid,text,jsonb)'",
    );
    expect(migration).not.toMatch(/\b(?:DROP|DELETE FROM|UPDATE payment_guides|TRUNCATE)\b/i);
  });

  it("revokes EXECUTE on the exact legacy function from every app/API role", () => {
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.persist_payment_guide_provider_charge_v1\(\s*text,text,text,text,text,timestamp with time zone,\s*text,text,text,text,text\s*\) FROM PUBLIC, authenticated, anonymous;/,
    );
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.persist_payment_guide_provider_charge_v1/i);
  });

  it("uses only municipality-scoped, authenticated persistence for provider charges", () => {
    expect(endpoint).not.toContain('rpcOrThrow(req, "persist_payment_guide_provider_charge_v1"');
    expect(persistence).toContain('"persist_payment_guide_provider_charge_v2"');
    expect(persistence).toContain("_municipality_id: guide.municipality_id");
    expect(persistence).toContain("persisted.id !== guide.id");
    expect(persistence).toContain("persisted.municipality_id !== guide.municipality_id");
  });
});
