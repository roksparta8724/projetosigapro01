import {
  isInternalRole,
  isProcessOwnedBySessionDepartment,
  resolveSessionOperationalArea,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

/** Operational link, not necessarily the external technical professional.
 *  Exact identifiers take precedence over names to avoid false ownership.
 *  The incoming record set has already been authorized by municipality RLS.
 */
function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

export function isProcessPersonallyLinked(
  process: ProcessRecord,
  operator?: SessionUser | null,
  operatorName = "",
): boolean {
  const name = normalize(operator?.name || operatorName);
  const id = String(operator?.id || "").trim();
  if (!name && !id) return false;

  const identityIds = [
    process.analysis?.assignedProfileId,
    process.createdByProfileId,
    process.createdByUserId,
    process.createdBy,
    ...(process.dispatches ?? []).map(dispatch => dispatch.requestedByProfileId),
    ...(process.auditTrail ?? []).map(entry => entry.actorProfileId),
  ];
  if (id && identityIds.some(candidate => String(candidate ?? "").trim() === id)) return true;

  // "technicalLead" is the external designer/engineer and cannot by itself
  // identify the municipal employee responsible for the record.
  const identityNames = [
    process.analysis?.assignedTo,
    process.triage?.assignedTo,
    ...(process.dispatches ?? []).flatMap(dispatch => [dispatch.assignedTo, dispatch.requestedBy]),
    ...(process.auditTrail ?? []).map(entry => entry.actor),
    ...(process.timeline ?? []).map(entry => entry.actor),
  ];
  if (name && identityNames.some(candidate => normalize(candidate) === name)) return true;

  // Only the old name-only consumer can use the historical technicalLead
  // fallback; a real municipal session should never be linked on that field.
  return !operator && Boolean(name) && normalize(process.technicalLead) === name;
}

export function hasOperationalUnit(operator?: SessionUser | null): boolean {
  if (!operator || !isInternalRole(operator.role) || operator.role === "prefeitura_admin") return false;
  if (operator.role === "master_admin" || operator.role === "master_ops") return false;
  return Boolean(resolveSessionOperationalArea(operator));
}

export function isProcessInMyUnit(process: ProcessRecord, operator?: SessionUser | null): boolean {
  return hasOperationalUnit(operator) &&
    isProcessOwnedBySessionDepartment(operator!, process);
}
