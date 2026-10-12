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

  const sessionMunicipalityId =
    session.municipalityId ?? session.tenantId ?? "";
  const municipalityId =
    sessionMunicipalityId || municipality?.id || scopeId || "";
  const municipalityMatchesSession =
    !sessionMunicipalityId ||
    !municipality?.id ||
    municipality.id === sessionMunicipalityId;

  const isMaster = session.role === "master_admin" || session.role === "master_ops";
  const isResolving =
    !isMaster &&
    (
      municipalityLoading ||
      platformDataLoading ||
      !municipalityId ||
      !municipalityMatchesSession ||
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
