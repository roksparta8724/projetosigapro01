import type { ClientPlanAssignment, Institution, PlanItem } from "@/lib/platform";
import type { PlanUsageSnapshot } from "@/lib/planUsageDashboard";
import { resolvePlanEntitlements } from "@/lib/planEntitlements";

type CatalogInput = {
  institutions: readonly Institution[];
  plans: readonly PlanItem[];
  assignments: readonly ClientPlanAssignment[];
  snapshots?: readonly PlanUsageSnapshot[];
};

/**
 * A municipality's commercial plan is its contract, not its branding/catalog
 * row. Municipality catalog refreshes historically preserved an obsolete
 * tenant.plan value (e.g. "Pro" after a real upgrade to Premium).
 *
 * Prefer the live authenticated Neon entitlement snapshot. Before the snapshot
 * arrives, use the verified plan assignment from the platform store. Retain
 * the original Institution object when there is no label change, so refreshing
 * usage counts does not reset in-progress municipal forms or cause flashes.
 *
 * No permission is derived from this label; authorization remains in the
 * entitlement hooks / server checks.
 */
export function reconcileInstitutionCommercialPlans(input: CatalogInput): Institution[] {
  const planById = new Map(input.plans.map((plan) => [plan.id, plan]));
  const assignmentByMunicipality = new Map(
    input.assignments.map((assignment) => [assignment.municipalityId, assignment]),
  );
  const liveByMunicipality = new Map(
    (input.snapshots ?? []).map((snapshot) => [snapshot.municipalityId, snapshot]),
  );

  return input.institutions.map((institution) => {
    const snapshot = liveByMunicipality.get(institution.id);
    const assignment = assignmentByMunicipality.get(institution.id);
    const assignedName = planById.get(assignment?.planId ?? "")?.name;
    const liveName = snapshot?.configured && snapshot.planId
      ? snapshot.planName || planById.get(snapshot.planId)?.name || null
      : null;
    const effectiveName = liveName ?? (
      snapshot && !snapshot.configured && institution.subdomain !== "sigapro-plataforma"
        ? "Sem plano comercial"
        : assignedName ?? institution.plan
    );

    return effectiveName !== institution.plan
      ? { ...institution, plan: effectiveName }
      : institution;
  });
}

/** Commercial monthly equivalent, not realized cash collection or bank settlement. */
export function summarizeMasterCommercialContracts(
  input: Pick<CatalogInput, "institutions" | "plans" | "assignments"> & { now?: Date },
): { activePlansCount: number; monthlyContractValue: number } {
  const visible = new Map(input.institutions.map((institution) => [institution.id, institution]));
  const planById = new Map(input.plans.map((plan) => [plan.id, plan]));
  const now = input.now ?? new Date();
  let activePlansCount = 0;
  let monthlyContractValue = 0;

  for (const assignment of input.assignments) {
    const institution = visible.get(assignment.municipalityId);
    const plan = planById.get(assignment.planId);
    if (!institution || institution.status !== "ativo" || !plan) continue;
    const contract = resolvePlanEntitlements({
      municipalityId: institution.id,
      plans: [plan],
      assignments: [assignment],
      now,
    });
    if (!contract.contractActive) continue;

    activePlansCount++;
    // Trials are active for use but do not constitute contracted monthly
    // revenue; annual contracts contribute their monthly equivalent.
    if (assignment.contractStatus === "trial") continue;
    const quotedPrice = assignment.isCustom && assignment.customPrice !== null
      ? Number(assignment.customPrice)
      : Number(plan.price);
    if (!Number.isFinite(quotedPrice) || quotedPrice < 0) continue;
    if (assignment.billingCycle === "mensal") monthlyContractValue += quotedPrice;
    else if (assignment.billingCycle === "anual") monthlyContractValue += quotedPrice / 12;
    // A customized billing cycle has no contractual monthly equivalent.
  }
  return {
    activePlansCount,
    monthlyContractValue: Math.round(monthlyContractValue * 100) / 100,
  };
}
