/**
 * SIGAPRO V9: keep a verified, currently mounted workspace on screen
 * during an explicit browser Refresh. Reloading a document destroys its DOM,
 * which makes the browser repaint the app's bare background for a frame.
 *
 * Navigation API may intercept eligible same-document navigations, but
 * the browser's own Reload button may initiate a new document before any
 * page listener runs. F5 / Ctrl+R / Cmd+R are intercepted only if the browser
 * dispatches a cancelable key event to this authenticated page.
 *
 * For a guaranteed uninterrupted update, use PortalFrame's "Atualizar dados"
 * action, which revalidates remote data without replacing the document.
 * Full browser reloads must use optimized first paint, not pretend the
 * browser can be forced to preserve the old DOM.
 *
 * No HTML snapshots, no fake shell and no stale protected DOM storage.
 * Install from the stable authenticated router gate, above lazy pages.
 * Shift+F5 / Ctrl+Shift+R always retain their native hard-reload meaning.
 *
 * Source: https://developer.mozilla.org/en-US/docs/Web/API/NavigateEvent/intercept
 */
type ReloadNavigationEvent = {
  navigationType?: string;
  canIntercept?: boolean;
  cancelable?: boolean;
  defaultPrevented?: boolean;
  preventDefault?: () => void;
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
      // Nunca bloquear recarregamento deliberado do próprio aplicativo.
      event.userInitiated === false
    ) return;

    // The Navigation API uses a serialized URL; compare normalized URLs
    // instead of a strict string (which can vary in encoding/hash notation).
    let sameDocument = false;
    try {
      const to = new URL(event.destination?.url || "", window.location.href);
      const from = new URL(window.location.href);
      sameDocument =
        to.origin === from.origin &&
        to.pathname === from.pathname &&
        to.search === from.search &&
        to.hash === from.hash;
    } catch {
      return;
    }
    if (!sameDocument) return;

    // Preferir interceptação de navegação sem reconstrução do documento.
    if (event.canIntercept && event.intercept) {
      try {
        event.intercept({
          focusReset: "manual",
          scroll: "manual",
          handler: refreshInPlace,
        });
        return;
      } catch {
        // Alguns navegadores recusam intercept() em recargas da toolbar.
      }
    }

    // Se o navegador informar reload do usuário e permitir cancelar o evento,
    // impedir a navegação completa e revalidar os dados na mesma página.
    // Quando o evento não é cancelável, deixar o reload nativo acontecer.
    if (event.cancelable && event.preventDefault) {
      try {
        event.preventDefault();
        if (event.defaultPrevented) void refreshInPlace();
      } catch {
        // Jamais bloquear a navegação ou mostrar shell artificial por falha.
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      !shouldHandle() ||
      document.visibilityState === "hidden" ||
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
