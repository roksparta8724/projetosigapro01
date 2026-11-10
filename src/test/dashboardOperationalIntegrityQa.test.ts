import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProcessRecord, ProcessStatus } from "@/lib/platform";
import {
  hasPrematureAnalysisStage,
  isAdministrativelyClosed,
  isVerifiedTechnicalAnalysis,
  type OperationalProcessSnapshot,
} from "@/lib/processOperationalIntegrity";

const record = (
  status: ProcessStatus,
  triageStatus: ProcessRecord["triage"]["status"],
): OperationalProcessSnapshot => ({ status, triage: { status: triageStatus } });

describe("SIGAPRO — verdade operacional dos dashboards de todos os perfis", () => {
  it("não confunde deferimento, indeferimento ou alvará emitido com arquivamento real", () => {
    for (const status of ["deferido", "indeferido", "analise_tecnica"] as const) {
      expect(isAdministrativelyClosed(record(status, "concluido"))).toBe(false);
    }
    expect(isAdministrativelyClosed(record("arquivado", "concluido"))).toBe(true);
  });

  it("recusa contar análise quando triagem não foi concluída", () => {
    for (const triage of ["recebido", "em_triagem"] as const) {
      const inconsistent = record("analise_tecnica", triage);
      expect(hasPrematureAnalysisStage(inconsistent)).toBe(true);
      expect(isVerifiedTechnicalAnalysis(inconsistent)).toBe(false);
    }
    expect(hasPrematureAnalysisStage(record("analise_tecnica", "concluido"))).toBe(false);
    expect(isVerifiedTechnicalAnalysis(record("analise_tecnica", "concluido"))).toBe(true);
    expect(isVerifiedTechnicalAnalysis(record("distribuicao", "concluido"))).toBe(false);
  });

  it("conserva decisão e processo bruto sem modificar estado persistido", () => {
    const inconsistent = Object.freeze(record("analise_tecnica", "recebido"));
    expect(hasPrematureAnalysisStage(inconsistent)).toBe(true);
    expect(inconsistent.status).toBe("analise_tecnica");
    expect(inconsistent.triage.status).toBe("recebido");
  });

  it("garante que Dashboard e painel municipal compartilhem as mesmas regras", () => {
    const dashboard = readFileSync(resolve("src/pages/saas/DashboardHomePage.tsx"), "utf8");
    const municipal = readFileSync(resolve("src/pages/saas/TenantAdminPage.tsx"), "utf8");
    expect(dashboard).toContain("displayProcesses.filter(isAdministrativelyClosed)");
    expect(dashboard).toContain("tenantProcesses.filter(isVerifiedTechnicalAnalysis)");
    expect(dashboard).toContain('data-dashboard-triage-divergence="true"');
    expect(municipal).toContain("tenantProcesses.filter(isVerifiedTechnicalAnalysis)");
    expect(municipal).toContain("isAdministrativelyClosed(process)");
    expect(municipal).toContain('data-municipal-triage-divergence="true"');
    expect(municipal).not.toContain('["deferido", "indeferido", "arquivado"]');
  });
});
