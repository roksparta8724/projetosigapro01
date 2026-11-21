import type { ProcessRecord } from "@/lib/platform";

/**
 * Municipal protocol *registration source* must come from the authenticated
 * creator's role, never the attached architect, dispatch route or current unit.
 * Old imports without provenance remain "unknown" rather than being presented
 * as real online/presential visits.
 */
export type ProtocolRegistrationSource = "internal" | "external" | "unknown";

const INTERNAL_ROLES = new Set([
  "master_admin", "master_ops", "prefeitura_admin",
  "prefeitura_supervisor", "analista", "financeiro", "setor_intersetorial", "fiscal",
]);

export function classifyProtocolRegistrationSource(
  process: Pick<ProcessRecord, "createdByRole">,
): ProtocolRegistrationSource {
  const role = String(process.createdByRole ?? "").trim().toLowerCase();
  if (role === "profissional_externo") return "external";
  if (INTERNAL_ROLES.has(role)) return "internal";
  return "unknown";
}
