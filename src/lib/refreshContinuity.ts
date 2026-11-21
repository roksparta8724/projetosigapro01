export const REFRESH_CONTINUITY_KEY = "sigapro.refresh.continuity.v1";
export const PLATFORM_SESSION_CACHE_KEY = "sigapro.platform.session.v1";

type ContinuitySnapshot = {
  host?: string;
  location?: string;
  userId?: string;
  savedAt?: number;
};

type CachedSessionIdentity = {
  id?: string;
  accountStatus?: string;
};

export function readCachedSessionIdentity(): CachedSessionIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLATFORM_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSessionIdentity;
    if (!parsed.id || parsed.id === "unknown") return null;
    if (parsed.accountStatus === "blocked" || parsed.accountStatus === "inactive") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Registra a rota REAL assim que o React Router termina de navegá-la.
 * Antes, apenas main.tsx (boot/pagehide) criava esse marcador: na PRIMEIRA
 * recarga após trocar a guia interna ainda constava a rota anterior.
 *
 * Não concede acesso nem armazena conteúdo privado. Só atualiza os metadados
 * quando a sessão em memória já foi validada pelo gateway e sua identidade
 * coincide com a sessão operacional local da mesma aba.
 */
export function persistVerifiedRouteContinuity(
  verifiedSessionId: string,
  expectedLocation: string,
): boolean {
  if (typeof window === "undefined" || !verifiedSessionId || verifiedSessionId === "unknown") return false;
  const cachedSession = readCachedSessionIdentity();
  if (cachedSession?.id !== verifiedSessionId) return false;

  const currentLocation =
    window.location.pathname + window.location.search + window.location.hash;
  if (expectedLocation !== currentLocation) return false;

  try {
    window.sessionStorage.setItem(REFRESH_CONTINUITY_KEY, JSON.stringify({
      host: window.location.host,
      location: currentLocation,
      userId: verifiedSessionId,
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    // Navegação e autorização reais nunca dependem de sessionStorage.
    return false;
  }
}

export function hasValidRefreshContinuity(expectedLocation?: string) {
  if (typeof window === "undefined") return false;

  try {
    const raw = window.sessionStorage.getItem(REFRESH_CONTINUITY_KEY);
    const cachedSession = readCachedSessionIdentity();
    if (!raw || !cachedSession?.id) return false;

    const snapshot = JSON.parse(raw) as ContinuitySnapshot;
    const currentLocation =
      expectedLocation ??
      (window.location.pathname + window.location.search + window.location.hash);

    return (
      snapshot.host === window.location.host &&
      snapshot.location === currentLocation &&
      snapshot.userId === String(cachedSession.id) &&
      typeof snapshot.savedAt === "number" &&
      Date.now() - snapshot.savedAt < 1000 * 60 * 5
    );
  } catch {
    return false;
  }
}
