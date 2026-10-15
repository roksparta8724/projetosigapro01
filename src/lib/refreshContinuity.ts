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
