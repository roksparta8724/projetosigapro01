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
    authenticatedEmail,
    authResolved,
    loading: authLoading,
  } = useAuthGateway();

  const authenticatedIdentityIds = [
    authenticatedProfileId,
    authenticatedUserId,
  ].filter((value): value is string => Boolean(value));

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

  const normalizedAuthenticatedEmail = String(authenticatedEmail ?? "").trim().toLowerCase();
  const normalizedSessionEmail = String(session.email ?? "").trim().toLowerCase();
  const identityMatchesAuth =
    (
      Boolean(authenticatedIdentityIds.length) &&
      authenticatedIdentityIds.includes(session.id)
    ) ||
    (
      Boolean(normalizedAuthenticatedEmail) &&
      normalizedAuthenticatedEmail === normalizedSessionEmail
    );

  const municipalityMatchesAuth =
    isMaster ||
    !authenticatedMunicipalityId ||
    sessionMunicipalityId === authenticatedMunicipalityId;

  // Mesmo o Master deve aguardar a confirmação da identidade real antes
  // de montar módulos. Plano comercial e Prefeitura são dispensados só depois.
  const authContextUnresolved =
    authLoading ||
    !authResolved ||
    !identityMatchesAuth ||
    session.id === "unknown";

  const planDataPending =
    !dataReadyForCurrentUser &&
    !dataError &&
    platformDataLoading;

  const isResolving =
    authContextUnresolved ||
    (!isMaster && (
      !municipalityMatchesAuth ||
      municipalityLoading ||
      !sessionMunicipalityId ||
      !municipalityMatchesSession ||
      planDataPending
    ));

  const resolutionFailed =
    !isResolving &&
    !isMaster &&
    Boolean(dataError) &&
    !dataReadyForCurrentUser;

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
      resolutionFailed,
      dataError,
      isConfigured: Boolean(state.assignment && state.plan),
      canUseModule: (module: PlanModuleName) =>
        !isResolving && (isMaster || planHasModule(state, module)),
    }),
    [dataError, isMaster, isResolving, resolutionFailed, state],
  );
}
