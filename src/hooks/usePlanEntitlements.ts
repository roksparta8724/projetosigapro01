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

  // Mesmo o Master deve aguardar a confirmação da identidade real antes
  // de montar módulos. Plano comercial e Prefeitura são dispensados só depois.
  const authContextUnresolved =
    authLoading ||
    !authResolved ||
    !identityMatchesAuth ||
    session.id === "unknown";

  const isResolving =
    authContextUnresolved ||
    (!isMaster && (
      !municipalityMatchesAuth ||
      !sessionMunicipalityId ||
      !municipalityMatchesSession ||
      !dataReadyForCurrentUser ||
      Boolean(dataError && !dataReadyForCurrentUser)
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
