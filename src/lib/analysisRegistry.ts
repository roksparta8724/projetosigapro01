import {
  canTrackProcess,
  getVisibleProcessesByScope,
  isProcessReleasedToUrbanAnalysis,
  matchesOperationalScope,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

/**
 * In-flight queue is intentionally stricter than the read-only historic index:
 * a guide and triage must be confirmed for ANY new technical action, but an
 * already analysed process must remain findable after forwarding/closure, or
 * while auxiliary guide data is being repaired.
 */
export function buildAnalysisRegistry(
  session: SessionUser,
  municipalityId: string | null | undefined,
  allProcesses: ProcessRecord[],
  officialDataSynced: boolean,
): { departmentProcesses: ProcessRecord[]; registry: ProcessRecord[] } {
  if (
    !officialDataSynced || !municipalityId ||
    session.accountStatus === "blocked" ||
    session.accountStatus === "inactive"
  ) {
    return { departmentProcesses: [], registry: [] };
  }

  const departmentProcesses = getVisibleProcessesByScope(
    session,
    municipalityId,
    allProcesses,
  ).filter(isProcessReleasedToUrbanAnalysis);
  const currentIds = new Set(departmentProcesses.map((item) => item.id));
  const registry = allProcesses.filter((item) => {
    if (!matchesOperationalScope(municipalityId, item)) return false;
    if (!canTrackProcess(session, item, municipalityId)) return false;

    const wasAnalyzed = Boolean(
      item.analysis?.startedAt ||
      item.analysis?.assignedTo ||
      item.analysis?.assignedProfileId,
    );
    // Historic consultation does not grant operational workflow actions.
    // A new, premature record must not appear merely because its status was
    // edited: its actual payment/triage gate remains in the operational queue.
    return currentIds.has(item.id) || wasAnalyzed;
  });

  return { departmentProcesses, registry };
}
