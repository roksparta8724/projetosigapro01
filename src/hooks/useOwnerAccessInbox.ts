import { useCallback, useEffect, useRef, useState } from "react";
import { listRemoteOwnerAccessInbox } from "@/integrations/backend/platform";
import type { OwnerProjectLink, OwnerProjectRequest } from "@/lib/platform";

/** Scoped, lightweight inbox polling; no full-process reload or flicker. */
export function useOwnerAccessInbox(
  identity: string,
  initialRequests: OwnerProjectRequest[],
  initialLinks: OwnerProjectLink[],
) {
  const [snapshot, setSnapshot] = useState<{
    identity: string; requests: OwnerProjectRequest[]; links: OwnerProjectLink[];
  } | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!identity) return;
    const request = ++sequence.current;
    try {
      const result = await listRemoteOwnerAccessInbox();
      if (request !== sequence.current) return;
      setSnapshot({ identity, ...result });
      setError("");
    } catch (failure) {
      if (request !== sequence.current) return;
      setError(failure instanceof Error ? failure.message : "Não foi possível sincronizar os acompanhamentos.");
    } finally {
      if (request === sequence.current) setRefreshing(false);
    }
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    let mounted = true;
    const poll = () => {
      if (!mounted || document.visibilityState === "hidden") return;
      void refresh();
    };
    setRefreshing(true);
    poll();
    const interval = window.setInterval(poll, 30000);
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      sequence.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [identity, refresh]);

  const own = snapshot?.identity === identity ? snapshot : null;
  return {
    requests: own?.requests ?? initialRequests,
    links: own?.links ?? initialLinks,
    error,
    refreshing,
    refresh,
  };
}
