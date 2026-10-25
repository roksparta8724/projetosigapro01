import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "neon/migrations/20261025_qa_protect_external_preprotocol_document_review_v1.sql",
  "utf8",
);

describe("SIGAPRO QA — revisão de documentos é exclusiva do servidor municipal", () => {
  it("impede execução no banco oficial e mudanças não controladas da função", () => {
    expect(migration).toContain("current_database()<>'sigapro_migration_stage_20260923'");
    expect(migration).toContain(
      "'public.update_external_preprotocol_draft_v1(uuid,jsonb)'::regprocedure",
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("expected exactly one match");
    expect(migration).not.toMatch(/\b(?:truncate|drop table|delete from public\.processes)\b/i);
  });

  it("impede que o profissional aprove ou revalide documentos e altere análise", () => {
    for (const protectedField of [
      "is_required=is_required",
      "review_status=review_status",
      "annotations=annotations",
      "is_valid=is_valid",
      "invalidated_at=invalidated_at",
    ]) {
      expect(migration).toContain(protectedField);
    }
    expect(migration).toContain("'pendente'");
    expect(migration).toContain("'[]'::jsonb");
  });

  it("impede falsificar documentos municipais e apagar exigências obrigatórias", () => {
    expect(migration).toContain("and coalesce(d.is_required,false)=false");
    expect(migration).toContain("and d.source='profissional'");
    expect(migration).toContain("coalesce(nullif(_doc->>'source',''),'profissional')");
    expect(migration).toContain("_new := $new4$'profissional'$new4$;");
  });

  it("mantém a rotina de atualização dos dados e força recarga do esquema", () => {
    expect(migration).toContain("EXECUTE _definition;");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
