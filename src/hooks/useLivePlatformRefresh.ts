import { useEffect, useRef } from "react";

type RefreshFunction = () => Promise<void>;

export function useLivePlatformRefresh(
  refreshRemoteStore: RefreshFunction,
  options?: {
    enabled?: boolean;
    intervalMs?: number;
    refreshOnMount?: boolean;
  },
) {
  const enabled = options?.enabled !== false;
  const intervalMs = Math.max(1500, options?.intervalMs ?? 4000);
  const refreshOnMount = options?.refreshOnMount !== false;
  const refreshRef = useRef(refreshRemoteStore);
  const inFlightRef = useRef(false);

  useEffect(() => {
    refreshRef.current = refreshRemoteStore;
  }, [refreshRemoteStore]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let disposed = false;

    const refresh = async () => {
      if (
        disposed ||
        inFlightRef.current ||
        (typeof document !== "undefined" && document.visibilityState !== "visible")
      ) {
        return;
      }

      inFlightRef.current = true;
      try {
        await refreshRef.current();
      } catch (error) {
        console.warn("[SIGAPRO][LiveRefresh] Revalidação silenciosa indisponível.", error);
      } finally {
        inFlightRef.current = false;
      }
    };

    const refreshWhenVisible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void refresh();
      }
    };

    if (refreshOnMount) void refresh();

    const timer = window.setInterval(refreshWhenVisible, intervalMs);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("pageshow", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    window.addEventListener("sigapro:data-changed", refreshWhenVisible as EventListener);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("pageshow", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      window.removeEventListener("sigapro:data-changed", refreshWhenVisible as EventListener);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, intervalMs, refreshOnMount]);
}
