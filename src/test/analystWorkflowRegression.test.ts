import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const analystDesk = readFileSync(resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
const dataHook = readFileSync(resolve(process.cwd(), "src/hooks/usePlatformData.tsx"), "utf8");
const backend = readFileSync(resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"), "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261011033000_start_process_analysis.sql"),
  "utf8",
);

describe("urban analysis workflow regressions", () => {
  it("starts analysis through a dedicated idempotent RPC instead of setting the same status twice", () => {
    expect(analystDesk).toContain("startProcessAnalysis(process.id)");
    expect(analystDesk).toContain("handleStartAnalysis");
    expect(analystDesk).toContain("/processos/${process.id}?aba=analise");
    expect(analystDesk).not.toContain("Processo distribuído para a mesa técnica.");
    expect(dataHook).toContain("startRemoteProcessAnalysis(processId)");
    expect(backend).toContain('callProcessRpc("start_process_analysis"');
  });

  it("assigns the analyst and records the start without duplicating a start already owned by the same analyst", () => {
    expect(migration).toContain("analysis_assigned_to_profile_id");
    expect(migration).toContain("analysis_started_at");
    expect(migration).toContain("_existing_assignee = _profile_id");
    expect(migration).toContain("'existing', true");
    expect(migration).toContain("'Análise Urbanística iniciada'");
  });

  it("prevents financial or fiscal advancement before analysis starts and required files are present", () => {
    expect(analystDesk).toContain(
      "disabled={Boolean(actionBusy) || !analysisStarted || pendingRequirements.length > 0 || missingRequiredDocuments > 0}",
    );
    expect(analystDesk).toContain("Responsável pela análise");
    expect(analystDesk).toContain("Continuar análise");
  });

  it("keeps the analysis queue renderable after premium action changes", () => {
    const lucideImport = analystDesk.match(/import\s*\{[\s\S]*?\}\s*from\s*"lucide-react";/)?.[0] || "";
    expect(lucideImport).toContain("Eye");
    expect(analystDesk).toContain("<Eye");
    expect(analystDesk).toContain("Abrir processo");
  });
});
