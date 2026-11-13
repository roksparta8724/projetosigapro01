import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { installSeamlessInternalRefresh } from "@/lib/seamlessInternalRefresh";
import { canRefreshMountedWorkspace, type RefreshWorkspaceState } from "@/lib/workspaceRefreshEligibility";

/**
 * Listener único acima das rotas, instalado incondicionalmente no mount.
 * Nunca depende de uma transição transitória de auth para instalar/desinstalar.
 */
export function SeamlessRefreshGate() {
  const location = useLocation();
  const auth = useAuthGateway();
  const { session } = usePlatformSession();
  const { refreshRemoteStore } = usePlatformData();

  const strictAuth =
    auth.authResolved &&
    auth.isAuthenticated &&
    Boolean(auth.authenticatedUserId) &&
    session.id !== "unknown" &&
    Boolean(session.role) &&
    session.accountStatus !== "blocked" &&
    session.accountStatus !== "inactive" &&
    !session.deletedAt;

  const state: RefreshWorkspaceState = {
    authResolved: auth.authResolved,
    isAuthenticated: auth.isAuthenticated,
    authenticatedUserId: auth.authenticatedUserId,
    sessionId: session.id,
    role: session.role,
    accountStatus: session.accountStatus,
    deleted: Boolean(session.deletedAt),
    pathname: location.pathname,
  };
  const latest = useRef({ state, strictAuth, refreshRemoteStore });
  latest.current = { state, strictAuth, refreshRemoteStore };
  const queuedUntilVerified = useRef(false);

  useLayoutEffect(() => {
    return installSeamlessInternalRefresh({
      isAuthenticated: () =>
        canRefreshMountedWorkspace(
          latest.current.state,
          Boolean(document.querySelector(".sig-app-frame")),
        ),
      refresh: async () => {
        if (!latest.current.strictAuth) {
          // Um F5 durante a hidratação nunca destrói o workspace; o backend
          // concluirá a identidade antes da próxima consulta de dados.
          queuedUntilVerified.current = true;
          return;
        }
        await latest.current.refreshRemoteStore();
      },
    });
  }, []);

  useEffect(() => {
    if (!auth.authResolved) return;
    if (!strictAuth) {
      queuedUntilVerified.current = false;
      return;
    }
    if (!queuedUntilVerified.current) return;
    queuedUntilVerified.current = false;
    void latest.current.refreshRemoteStore().catch((error) => {
      console.warn("[SIGAPRO][Refresh] Revalidação após autenticação não concluída.", error);
    });
  }, [auth.authResolved, strictAuth]);

  return null;
}
