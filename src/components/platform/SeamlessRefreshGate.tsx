import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { installSeamlessInternalRefresh } from "@/lib/seamlessInternalRefresh";
import { canRefreshMountedWorkspace, type RefreshWorkspaceState } from "@/lib/workspaceRefreshEligibility";
import { persistVerifiedRouteContinuity } from "@/lib/refreshContinuity";
import { hasNewPublishedAppRelease } from "@/lib/appReleaseFreshness";

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

  // Atualizar a identificação de continuidade em CADA guia/rota real, não
  // somente no pagehide. Assim a primeira atualização após trocar de página
  // já reconhece a URL correta, sem um boot visual intermediário.
  useLayoutEffect(() => {
    if (!strictAuth || !canRefreshMountedWorkspace(state, Boolean(document.querySelector(".sig-app-frame")))) return;
    persistVerifiedRouteContinuity(
      session.id,
      location.pathname + (location.search ?? "") + (location.hash ?? ""),
    );
  }, [
    strictAuth,
    session.id,
    session.role,
    session.accountStatus,
    session.deletedAt,
    location.pathname,
    location.search,
    location.hash,
  ]);

  useLayoutEffect(() => {
    let disposed = false;
    let releaseReload = false;
    let refreshInFlight: Promise<void> | null = null;
    const workspaceIsMounted = () => Boolean(document.querySelector(".sig-app-frame"));
    const hasVerifiedWorkspace = () =>
      !disposed && !releaseReload &&
      latest.current.strictAuth &&
      canRefreshMountedWorkspace(latest.current.state, workspaceIsMounted());

    const refreshCurrentRelease = () => {
      if (refreshInFlight) return refreshInFlight;
      const identity = latest.current.state.sessionId;
      const route = window.location.href;
      refreshInFlight = (async () => {
        const changed = await hasNewPublishedAppRelease(document, window.location.origin);
        if (disposed || !hasVerifiedWorkspace() ||
            latest.current.state.sessionId !== identity || window.location.href !== route) return;
        if (changed) {
          // An explicit browser refresh must install a new release, not keep
          // the old React tree. Deny the SW preservation handshake for this reload.
          releaseReload = true;
          window.location.reload();
          return;
        }
        await latest.current.refreshRemoteStore();
      })().finally(() => { refreshInFlight = null; });
      return refreshInFlight;
    };

    const onServiceWorkerMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; location?: string } | null;
      if (!message || (message.type !== "SIGAPRO_LIVE_RELOAD_PROBE" &&
                       message.type !== "SIGAPRO_LIVE_RELOAD_REFRESH")) return;

      const location = window.location.pathname + window.location.search;
      const eligible = hasVerifiedWorkspace() &&
        message.location === location;

      if (message.type === "SIGAPRO_LIVE_RELOAD_PROBE") {
        // No assertion based on a saved login or screenshot: the browser must
        // ask the live, authenticated app for permission to keep this DOM.
        event.ports?.[0]?.postMessage({
          type: "SIGAPRO_LIVE_RELOAD_ELIGIBLE",
          eligible,
          location,
        });
        return;
      }

      if (!eligible) return;
      // Backend revalidation without destroying the real frame, avatar, open
      // process controls or the user's unsaved form state.
      void refreshCurrentRelease().catch((error) => {
        console.warn("[SIGAPRO][Refresh] Falha ao sincronizar dados sem desmontar a página.", error);
      });
    };

    const disposeRefresh = installSeamlessInternalRefresh({
      isAuthenticated: () =>
        !disposed && !releaseReload && canRefreshMountedWorkspace(latest.current.state, workspaceIsMounted()),
      refresh: async () => {
        if (!latest.current.strictAuth) {
          // Um F5 durante a hidratação nunca destrói o workspace; o backend
          // concluirá a identidade antes da próxima consulta de dados.
          queuedUntilVerified.current = true;
          return;
        }
        await refreshCurrentRelease();
      },
    });

    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
    return () => {
      disposed = true;
      disposeRefresh();
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    };
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
