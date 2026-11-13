import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { installSeamlessInternalRefresh } from "@/lib/seamlessInternalRefresh";

type RefreshWorkspaceState = {
  authResolved: boolean;
  isAuthenticated: boolean;
  authenticatedUserId: string | null;
  sessionId: string;
  role: string | null;
  accountStatus: string | null | undefined;
  deleted: boolean;
  pathname: string;
};

/**
 * Refresh só é tratado dentro de uma interface operacional já montada.
 * Nunca desbloqueia conteúdo: quem autoriza a rota é PermissionRoute.
 *
 * PermissionRoute pode conservar a interface real durante a restauração
 * segura de sessão do Neon, enquanto authResolved ainda é false. O listener
 * anterior era removido exatamente nesse intervalo, e o F5 virava reload
 * completo (tela branca), apesar de a página estar visível.
 */
export function canRefreshMountedWorkspace(
  state: RefreshWorkspaceState,
  hasMountedWorkspace: boolean,
): boolean {
  if (!hasMountedWorkspace || !state.sessionId || state.sessionId === "unknown" || !state.role) return false;
  if (state.accountStatus === "blocked" || state.accountStatus === "inactive" || state.deleted) return false;

  const path = state.pathname;
  if (
    ["/", "/inicio", "/apresentacao", "/planos-publicos", "/acesso", "/criar-conta", "/recuperar-senha", "/verificar-assinatura"].includes(path) ||
    path.startsWith("/cliente/") ||
    path.startsWith("/v/") ||
    /\/processos\/[^/]+\/documentos\/[^/]+\/(visualizar|analisar)$/.test(path)
  ) return false;

  // Se o servidor já respondeu que NÃO há autenticação, não suprimir recarga.
  if (state.authResolved) return state.isAuthenticated && Boolean(state.authenticatedUserId);

  // Durante a hidratação, só preservar um workspace real já em tela e com
  // sessão local admissível. Jamais criar um shell ou restaurar DOM privado.
  return true;
}

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
