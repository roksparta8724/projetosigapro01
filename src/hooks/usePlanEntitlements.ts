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
    source: platformDataSource,
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

  const hasStableCachedSession =
    session.id !== "unknown" &&
    Boolean(session.role) &&
    (
      isMaster ||
      Boolean(sessionMunicipalityId) ||
      session.role === "profissional_externo" ||
      session.role === "proprietario_consulta" ||
      session.role === "property_owner"
    );

  // Se o provedor já informou outra identidade, bloqueie imediatamente para
  // nunca cruzar contas. No F5 da MESMA conta, porém, a sessão visual cacheada
  // permanece autorizada para renderização enquanto a revalidação ocorre.
  const explicitIdentityMismatch =
    Boolean(authenticatedBusinessUserId) &&
    session.id !== authenticatedBusinessUserId;

  const authContextUnresolved =
    explicitIdentityMismatch ||
    (
      !hasStableCachedSession &&
      (
        authLoading ||
        !authResolved ||
        !identityMatchesAuth ||
        session.id === "unknown"
      )
    );

  const hasWarmPlanContext =
    platformDataSource === "warm" &&
    hasStableCachedSession &&
    (isMaster || Boolean(sessionMunicipalityId));

  const isResolving =
    authContextUnresolved ||
    (!isMaster && (
      !municipalityMatchesAuth ||
      !sessionMunicipalityId ||
      !municipalityMatchesSession ||
      (!dataReadyForCurrentUser && !hasWarmPlanContext) ||
      Boolean(dataError && !dataReadyForCurrentUser && !hasWarmPlanContext)
    ));

  // Carregamentos de fundo da Prefeitura ou do store não podem desmontar uma
  // tela já autorizada. Eles atualizam dados em segundo plano sem mostrar a
  // página intermediária "Validando acesso da Prefeitura".
  const isBackgroundRefreshing =
    !isResolving &&
    (municipalityLoading || platformDataLoading);

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
      isBackgroundRefreshing,
      dataError,
      isConfigured: Boolean(state.assignment && state.plan),
      canUseModule: (module: PlanModuleName) =>
        !isResolving && (isMaster || planHasModule(state, module)),
    }),
    [dataError, isBackgroundRefreshing, isMaster, isResolving, state],
  );
}
