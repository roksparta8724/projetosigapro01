/**
 * Recover only from a missing Vite release chunk, not arbitrary rendering
 * failures. SessionStorage contains a time/route marker, never account data.
 * A single native reload loads the CURRENT HTML and preserves the URL/session.
 */
const ATTEMPT_KEY = "sigapro.release-chunk-recovery.v1";
const RELOAD_WINDOW_MS = 120_000;

export function isStaleChunkFailure(
  error: unknown,
  origin = typeof window === "undefined" ? "" : window.location.origin,
): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!/(?:failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk [^\n]+ failed|failed to load module script)/i.test(message)) {
    return false;
  }
  // Do not retry unrelated cross-origin scripts, redirects or unexpected URLs.
  const referenced = message.match(/https?:\/\/[^\s)'"]+/i)?.[0];
  if (!referenced) return true;
  try {
    const url = new URL(referenced);
    return Boolean(origin) && url.origin === origin && url.pathname.startsWith("/assets/");
  } catch {
    return false;
  }
}

export function canRetryMissingChunk(previous: string | null, route: string, now: number): boolean {
  if (!previous) return true;
  try {
    const saved = JSON.parse(previous) as { route?: unknown; at?: unknown };
    if (saved.route !== route || typeof saved.at !== "number" ||
        !Number.isFinite(saved.at)) return true;
    return now < saved.at || now - saved.at > RELOAD_WINDOW_MS;
  } catch {
    return true;
  }
}

export function recoverStaleChunkOnce(error: unknown): boolean {
  if (!isStaleChunkFailure(error) || typeof window === "undefined") return false;
  const route = window.location.pathname + window.location.search + window.location.hash;
  const now = Date.now();
  try {
    const previous = window.sessionStorage.getItem(ATTEMPT_KEY);
    if (!canRetryMissingChunk(previous, route, now)) return false;
    // If storage is inaccessible, fail closed rather than risk a reload loop.
    window.sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ route, at: now }));
  } catch {
    return false;
  }

  // Invalidate only the obsolete static app shell and bundles. Never touch
  // private data, signed-in sessions, R2, Neon or IndexedDB.
  try {
    window.navigator.serviceWorker?.controller?.postMessage({
      type: "SIGAPRO_CLEAR_STALE_APP_SHELL",
    });
  } catch { /* Unsupported browser: native reload is still safe. */ }

  // Give the worker a brief opportunity to discard public stale HTML first.
  // Normal F5 navigation is otherwise untouched, avoiding the old white flash.
  window.setTimeout(() => window.location.reload(), 120);
  return true;
}
