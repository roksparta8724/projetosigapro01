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
  const intervalMs = Math.max(3000, options?.intervalMs ?? 8000);
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
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, intervalMs, refreshOnMount]);
}
