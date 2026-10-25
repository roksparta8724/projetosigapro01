import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "neon/migrations/20261025_qa_restrict_internal_notification_enqueue_v1.sql",
  "utf8",
);

describe("SIGAPRO QA — notificações autenticadas por wrappers internos", () => {
  it("nunca altera bancos fora do QA nem modifica notificações existentes", () => {
    expect(migration).toContain("current_database() <> 'sigapro_migration_stage_20260923'");
    expect(migration).not.toMatch(/\b(?:drop|delete from|update public\.notifications|truncate|insert into)\b/i);
    expect(migration).toContain(
      "'public.enqueue_notification_v1(uuid,text,text,text,uuid,text,text,text,uuid,text,jsonb)'",
    );
  });

  it("exige a topologia de nove wrappers/triggers SECURITY DEFINER", () => {
    expect(migration).toContain("caller_count<>9");
    expect(migration).toContain("p.prosecdef");
    expect(migration).toContain("p.proowner='neondb_owner'::regrole::oid");
    expect(migration).toContain("pg_get_functiondef(p.oid)");
  });

  it("bloqueia envio direto público ou pelo navegador, preservando proprietário interno", () => {
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.enqueue_notification_v1\(\s*uuid,text,text,text,uuid,text,text,text,uuid,text,jsonb\s*\) FROM PUBLIC, anonymous, authenticated;/,
    );
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION/i);
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
