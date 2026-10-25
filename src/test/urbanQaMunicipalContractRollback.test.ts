import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const acceptance = readFileSync(
  "scripts/urban-neon-two-municipality-contract-rollback-qa.sql", "utf8"
);

describe("SIGAPRO QA — contrato municipal nos testes reversíveis", () => {
  it("somente insere contrato sintético quando o município QA ainda não possui contrato", () => {
    expect(acceptance).toContain("IF NOT EXISTS(");
    expect(acceptance).toContain("WHERE municipality_id=b.municipality_id");
    expect(acceptance).toContain("INSERT INTO public.client_plan_assignments");
    expect(acceptance).toContain("ELSIF NOT EXISTS(");
    expect(acceptance).toContain("contract_status='ativo'");
    expect(acceptance).not.toMatch(/UPDATE\s+public\.client_plan_assignments\b/i);
    expect(acceptance).not.toMatch(/DELETE\s+FROM\s+public\.client_plan_assignments\b/i);
  });

  it("preserva a validação de duas prefeituras e reverte todos os dados sintéticos", () => {
    expect(acceptance).toContain("current_database() <> 'sigapro_migration_stage_20260923'");
    expect(acceptance).toContain("COUNT(DISTINCT");
    expect(acceptance).toContain("QA_ROLLBACK_EXPECTED");
    expect(acceptance).toContain("EXCEPTION WHEN OTHERS");
    expect(acceptance).toContain("Falha na reversão do teste QA");
  });
});
