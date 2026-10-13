import { useMemo } from "react";
import { useAuthGateway } from "@/hooks/useAuthGateway";
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
  const {
    authenticatedUserId,
    authenticatedProfileId,
    authenticatedMunicipalityId,
    authResolved,
    loading: authLoading,
  } = useAuthGateway();

  const authenticatedBusinessUserId =
    authenticatedProfileId || authenticatedUserId || "";

  const sessionMunicipalityId =
    session.municipalityId ?? session.tenantId ?? "";

  const isMaster = session.role === "master_admin" || session.role === "master_ops";

  // Em troca de login, municipality/scopeId ainda podem representar a conta anterior
  // por alguns frames. Para usuários municipais, o escopo contratual só pode vir da
  // sessão autenticada atual. Nunca usar fallback de Prefeitura antiga para decidir plano.
  const municipalityId = isMaster
    ? sessionMunicipalityId || municipality?.id || scopeId || ""
    : sessionMunicipalityId;

  const municipalityMatchesSession =
    !municipality?.id ||
    !sessionMunicipalityId ||
    municipality.id === sessionMunicipalityId;

  const identityMatchesAuth =
    Boolean(authenticatedBusinessUserId) &&
    session.id === authenticatedBusinessUserId;

  const municipalityMatchesAuth =
    isMaster ||
    !authenticatedMunicipalityId ||
    sessionMunicipalityId === authenticatedMunicipalityId;

  const isResolving =
    !isMaster &&
    (
      authLoading ||
      !authResolved ||
      !identityMatchesAuth ||
      !municipalityMatchesAuth ||
      session.id === "unknown" ||
      municipalityLoading ||
      platformDataLoading ||
      !sessionMunicipalityId ||
      !municipalityMatchesSession ||
      !dataReadyForCurrentUser ||
      Boolean(dataError)
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
