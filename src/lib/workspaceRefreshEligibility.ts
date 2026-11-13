export type RefreshWorkspaceState = {
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

