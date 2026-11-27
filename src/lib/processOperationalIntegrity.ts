import type { ProcessRecord } from "@/lib/platform";

/** Read-only dashboard truth. The backend remains the authority for transitions. */
export type OperationalProcessSnapshot = Pick<ProcessRecord, "status" | "triage">;

/** Detects a legacy or inconsistent record; never changes its database status. */
export function hasPrematureAnalysisStage(process: OperationalProcessSnapshot): boolean {
  return process.status === "analise_tecnica" &&
    process.triage?.status !== "concluido";
}

/** "Em análise" must not include a record that has not passed triage. */
export function isVerifiedTechnicalAnalysis(process: OperationalProcessSnapshot): boolean {
  return process.status === "analise_tecnica" &&
    !hasPrematureAnalysisStage(process);
}

/** A favorable/unfavorable decision is not administrative archival. */
export function isAdministrativelyClosed(process: OperationalProcessSnapshot): boolean {
  return process.status === "arquivado";
}
