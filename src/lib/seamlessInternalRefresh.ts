/**
 * SIGAPRO V9: keep a verified, currently mounted workspace on screen
 * during an explicit browser Refresh. Reloading a document destroys its DOM,
 * which makes the browser repaint the app's bare background for a frame.
 *
 * Navigation API intercept("reload") converts the browser refresh button to
 * a same-document update, where supported. Keyboard interception handles
 * F5 / Ctrl+R / Cmd+R in all browsers that permit preventDefault.
 *
 * No HTML snapshots, no fake shell and no stale protected DOM storage.
 * Only install from an already mounted, authenticated PortalFrame.
 * Shift+F5 / Ctrl+Shift+R always retain their native hard-reload meaning.
 *
 * Source: https://developer.mozilla.org/en-US/docs/Web/API/NavigateEvent/intercept
 */
type ReloadNavigationEvent = {
  navigationType?: string;
  canIntercept?: boolean;
  userInitiated?: boolean;
  destination?: { url?: string };
  intercept?: (options: {
    focusReset: "manual";
    scroll: "manual";
    handler: () => Promise<void>;
  }) => void;
};

type ReloadNavigation = {
  addEventListener: (type: "navigate", listener: (event: ReloadNavigationEvent) => void) => void;
  removeEventListener: (type: "navigate", listener: (event: ReloadNavigationEvent) => void) => void;
};

export type SeamlessRefreshOptions = {
  isAuthenticated: () => boolean;
  refresh: () => Promise<unknown>;
};

export function installSeamlessInternalRefresh(options: SeamlessRefreshOptions): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const navigation = (window as unknown as { navigation?: ReloadNavigation }).navigation;
  let inFlight = false;
  let disposed = false;

  const shouldHandle = () =>
    !disposed &&
    options.isAuthenticated() &&
    document.visibilityState !== "hidden" &&
    !/\/processos\/[^/]+\/documentos\/[^/]+\/(visualizar|analisar)$/.test(window.location.pathname);

  const refreshInPlace = async () => {
    if (inFlight || !shouldHandle()) return;
    inFlight = true;
    try {
      // The official data provider revalidates its backend identity and
      // preserves stable slice references, so this must not flash the UI.
      await options.refresh();
    } catch (error) {
      // Existing platform data state exposes real errors without an interstitial.
      console.warn("[SIGAPRO][Refresh] Revalidação sem recarregamento não concluída.", error);
    } finally {
      inFlight = false;
    }
  };

  const onNavigate = (event: ReloadNavigationEvent) => {
    if (
      !shouldHandle() ||
      event.navigationType !== "reload" ||
      !event.canIntercept ||
      !event.intercept ||
      // A programmatic location.reload() must still be allowed when the
      // application deliberately requires a true reload after a code update.
      event.userInitiated === false ||
      event.destination?.url !== window.location.href
    ) return;

    event.intercept({
      focusReset: "manual",
      scroll: "manual",
      handler: refreshInPlace,
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      !shouldHandle() ||
      event.repeat ||
      event.defaultPrevented ||
      event.shiftKey ||
      event.altKey ||
      event.isComposing
    ) return;

    const key = event.key.toLowerCase();
    const refreshKey =
      key === "f5" ||
      (key === "r" && (event.ctrlKey || event.metaKey));

    if (!refreshKey) return;
    event.preventDefault();
    void refreshInPlace();
  };

  if (navigation?.addEventListener) navigation.addEventListener("navigate", onNavigate);
  window.addEventListener("keydown", onKeyDown, { capture: true });

  return () => {
    disposed = true;
    if (navigation?.removeEventListener) navigation.removeEventListener("navigate", onNavigate);
    window.removeEventListener("keydown", onKeyDown, { capture: true });
  };
}
