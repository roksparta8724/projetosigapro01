import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { installSeamlessInternalRefresh } from "@/lib/seamlessInternalRefresh";

/**
 * One stable refresh listener for the *authenticated* application.
 *
 * It must live above AppRoutes, not inside PortalFrame or a lazy page.
 * Route switches and provider refreshes may remount a PortalFrame; doing so
 * previously introduced intervals with no F5 handler. No UI, cached document
 * snapshots or permissions are created here. Existing route guards remain.
 */
export function SeamlessRefreshGate() {
  const location = useLocation();
  const auth = useAuthGateway();
  const { session } = usePlatformSession();
  const { refreshRemoteStore } = usePlatformData();

  const isAuthenticated =
    auth.authResolved &&
    auth.isAuthenticated &&
    Boolean(auth.authenticatedUserId) &&
    session.id !== "unknown" &&
    Boolean(session.role) &&
    session.accountStatus !== "blocked" &&
    session.accountStatus !== "inactive" &&
    !session.deletedAt;

  // Auth state, selected route and function can change between event
  // registration and the event. The callback must always use current values.
  const latest = useRef({ isAuthenticated, refreshRemoteStore, pathname: location.pathname });
  latest.current = { isAuthenticated, refreshRemoteStore, pathname: location.pathname };

  useLayoutEffect(() => {
    // Install once for this verified identity; do not detach on tab switches.
    if (!isAuthenticated) return;

    return installSeamlessInternalRefresh({
      isAuthenticated: () => latest.current.isAuthenticated,
      refresh: () => latest.current.refreshRemoteStore(),
    });
  }, [isAuthenticated]);

  return null;
}
