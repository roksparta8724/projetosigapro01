import { useEffect, useMemo, useState } from "react";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  planHasModule,
  resolvePlanEntitlements,
  type PlanModuleName,
} from "@/lib/planEntitlements";

const PLAN_RESOLUTION_TIMEOUT_MS = 6000;
const resolutionStartedAtByIdentity = new Map<string, number>();

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
  const authIdentityMismatch =
    !authLoading &&
    authResolved &&
    session.id !== "unknown" &&
    !identityMatchesAuth;

  const stableAuthenticatedIdentity =
    session.id !== "unknown" &&
    (
      (Boolean(authenticatedProfileId) && session.id === authenticatedProfileId) ||
      (Boolean(authenticatedUserId) && session.id === authenticatedUserId) ||
      (
        Boolean(normalizedAuthenticatedEmail) &&
        normalizedAuthenticatedEmail === normalizedSessionEmail
      )
    );

  const authContextUnresolved =
    authLoading ||
    session.id === "unknown" ||
    (!authResolved && !stableAuthenticatedIdentity);

  const terminalDataFailure =
    Boolean(dataError) &&
    !dataReadyForCurrentUser;

  const planDataPending =
    !dataReadyForCurrentUser &&
    !terminalDataFailure &&
    platformDataLoading;

  const rawResolving =
    !terminalDataFailure &&
    !authIdentityMismatch &&
    (
      authContextUnresolved ||
      (!isMaster && (
        !municipalityMatchesAuth ||
        !sessionMunicipalityId ||
        planDataPending
      ))
    );

  const resolutionKey = [
    authenticatedBusinessUserId ||
      normalizedAuthenticatedEmail ||
      session.id ||
      "anonymous",
    authenticatedMunicipalityId ||
      sessionMunicipalityId ||
      "no-municipality",
  ].join(":");
  const [resolutionTimedOut, setResolutionTimedOut] = useState(false);

  useEffect(() => {
    if (!rawResolving) {
      if (dataReadyForCurrentUser || terminalDataFailure || authIdentityMismatch) {
        resolutionStartedAtByIdentity.delete(resolutionKey);
      }
      setResolutionTimedOut(false);
      return;
    }

    const now = Date.now();
    const startedAt =
      resolutionStartedAtByIdentity.get(resolutionKey) ?? now;
    resolutionStartedAtByIdentity.set(resolutionKey, startedAt);

    const remaining = PLAN_RESOLUTION_TIMEOUT_MS - (now - startedAt);
    if (remaining <= 0) {
      setResolutionTimedOut(true);
      return;
    }

    setResolutionTimedOut(false);
    const timer = window.setTimeout(() => {
      setResolutionTimedOut(true);
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [
    authIdentityMismatch,
    dataReadyForCurrentUser,
    rawResolving,
    resolutionKey,
    terminalDataFailure,
  ]);

  const isResolving = rawResolving && !resolutionTimedOut;

  const resolutionFailed =
    !isMaster &&
    !authLoading &&
    authResolved &&
    (
      terminalDataFailure ||
      authIdentityMismatch ||
      !municipalityMatchesAuth ||
      resolutionTimedOut
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
      resolutionFailed,
      resolutionTimedOut,
      authIdentityMismatch,
      dataError,
      isConfigured: Boolean(state.assignment && state.plan),
      canUseModule: (module: PlanModuleName) =>
        !isResolving && (isMaster || planHasModule(state, module)),
    }),
    [authIdentityMismatch, dataError, isMaster, isResolving, resolutionFailed, resolutionTimedOut, state],
  );
}
