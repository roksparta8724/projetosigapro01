import { useMemo } from "react";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  planHasModule,
  resolvePlanEntitlements,
  type PlanModuleName,
} from "@/lib/planEntitlements";

export function usePlanEntitlements() {
  const {
    plans,
    planAssignments,
    loading: platformDataLoading,
    dataError,
    dataReadyForCurrentUser,
  } = usePlatformData();
  const {
    municipality,
    scopeId,
    loading: municipalityLoading,
  } = useMunicipality();
  const { session } = usePlatformSession();

  const municipalityId =
    municipality?.id ?? scopeId ?? session.municipalityId ?? session.tenantId ?? "";

  const isMaster = session.role === "master_admin" || session.role === "master_ops";
  const isResolving =
    !isMaster &&
    (
      municipalityLoading ||
      platformDataLoading ||
      !municipalityId ||
      !dataReadyForCurrentUser
    );

  const state = useMemo(
    () =>
      resolvePlanEntitlements({
        municipalityId,
        plans,
        assignments: planAssignments,
      }),
    [municipalityId, planAssignments, plans],
  );

  return useMemo(
    () => ({
      ...state,
      isMaster,
      isResolving,
      dataError,
      isConfigured: Boolean(state.assignment && state.plan),
      canUseModule: (module: PlanModuleName) =>
        isMaster || (!isResolving && planHasModule(state, module)),
    }),
    [dataError, isMaster, isResolving, state],
  );
}
