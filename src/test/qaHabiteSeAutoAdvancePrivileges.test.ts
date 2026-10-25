import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "neon/migrations/20261025_qa_lock_habite_se_auto_advance_rpc_v1.sql",
  "utf8",
);
const normalized = migration.toLowerCase();

describe("SIGAPRO QA — Habite-se só avança por gatilhos internos", () => {
  it("recusa execução fora do banco QA e em um esquema de funções inesperado", () => {
    expect(migration).toContain("current_database() <> 'sigapro_migration_stage_20260923'");
    expect(migration).toContain("'public.try_advance_habite_se_to_inspection_v1(uuid,uuid)'");
    expect(migration).toContain("p.prosecdef AND p.prokind='f'");
    expect(normalized).not.toMatch(/\b(?:drop|truncate|delete from|update public\.processes|insert into)\b/);
  });

  it("verifica os três gatilhos automáticos antes de bloquear acesso direto", () => {
    for (const trigger of [
      "trg_try_advance_habite_se_from_analysis_sheet_v1",
      "trg_try_advance_habite_se_from_document_v1",
      "trg_try_advance_habite_se_from_requirement_v1",
    ]) expect(migration).toContain(trigger);
    expect(migration).toContain("COUNT(DISTINCT p.proname)");
    expect(migration).toContain(") <> 3 THEN");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION");
    expect(migration).toContain("FROM PUBLIC, anonymous, authenticated;");
  });

  it("não modifica documentos nem reabre permissões dos atores", () => {
    expect(normalized).not.toContain("grant execute");
    expect(normalized).not.toContain("create or replace function");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
