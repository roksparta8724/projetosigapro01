/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SessionUser, roleLabels } from "@/lib/platform";
import { useAuthGateway } from "@/hooks/useAuthGateway";

interface PlatformSessionContextValue {
  session: SessionUser;
  sessions: SessionUser[];
  setActiveSession: (userId: string) => void;
}

const PlatformSessionContext = createContext<PlatformSessionContextValue | null>(null);
const SESSION_CACHE_KEY = "sigapro.platform.session.v1";

function readCachedSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    if (!parsed.id || parsed.id === "unknown" || !parsed.role) return null;
    return parsed as SessionUser;
  } catch {
    return null;
  }
}

function writeCachedSession(session: SessionUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (!session || session.id === "unknown") {
      window.localStorage.removeItem(SESSION_CACHE_KEY);
      return;
    }
    window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
  } catch {
    // noop
  }
}

function normalizeRole(role: string | null | undefined): SessionUser["role"] {
  const raw = (role ?? "").toLowerCase();
  if (raw === "admin_master") return "master_admin";
  if (raw === "master") return "master_admin";
  if (raw === "prefeitura_admin") return "prefeitura_admin";
  if (raw === "prefeitura_supervisor") return "prefeitura_supervisor";
  if (raw === "master_ops") return "master_ops";
  if (raw === "profissional_externo") return "profissional_externo";
  if (raw === "property_owner") return "property_owner";
  if (raw === "proprietario_consulta") return "proprietario_consulta";
  if (raw === "financeiro") return "financeiro";
  if (raw === "analista") return "analista";
  if (raw === "setor_intersetorial") return "setor_intersetorial";
  return (raw as SessionUser["role"]) || "profissional_externo";
}

export function PlatformSessionProvider({ children }: { children: React.ReactNode }) {
  const {
    authenticatedEmail,
    authenticatedRole,
    authenticatedUserId,
    authenticatedMunicipalityId,
    loading: authLoading,
  } = useAuthGateway();
  const cachedSessionRef = useRef<SessionUser | null>(readCachedSession());
  const [sessionVersion, setSessionVersion] = useState(0);

  const session = useMemo<SessionUser>(() => {
    const cachedSession = cachedSessionRef.current;
    if (cachedSession && (!authenticatedUserId || cachedSession.id === authenticatedUserId)) {
      const safeRole = normalizeRole(authenticatedRole ?? cachedSession.role);
      return {
        ...cachedSession,
        id: authenticatedUserId || cachedSession.id,
        role: safeRole,
        accessLevel:
          safeRole === "master_admin" || safeRole === "prefeitura_admin"
            ? 3
            : safeRole === "prefeitura_supervisor"
              ? 2
              : cachedSession.accessLevel ?? 1,
        tenantId: authenticatedMunicipalityId ?? cachedSession.tenantId ?? null,
        municipalityId: authenticatedMunicipalityId ?? cachedSession.municipalityId ?? null,
        title: roleLabels[safeRole] || cachedSession.title || "Usuário",
        email: authenticatedEmail || cachedSession.email || "",
      };
    }

    const safeRole = normalizeRole(authenticatedRole);
    const email = authenticatedEmail || "";
    return {
      id: authenticatedUserId || "unknown",
      name:
        email
          .split("@")[0]
          ?.replace(/[._-]/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase()) || "Usuário autenticado",
      role: safeRole,
      accessLevel:
        safeRole === "master_admin" || safeRole === "prefeitura_admin"
          ? 3
          : safeRole === "prefeitura_supervisor"
            ? 2
            : 1,
      tenantId: authenticatedMunicipalityId ?? null,
      municipalityId: authenticatedMunicipalityId ?? null,
      title: roleLabels[safeRole] || "Usuário",
      email,
      accountStatus: "active",
      userType: "Usuário",
      department: "",
      createdAt: "",
      lastAccessAt: "",
      blockedAt: null,
      blockedBy: null,
      blockReason: null,
      deletedAt: null,
    };
  }, [authLoading, authenticatedEmail, authenticatedMunicipalityId, authenticatedRole, authenticatedUserId, sessionVersion]);

  useEffect(() => {
    const handleSessionUpdated = (event: Event) => {
      const detail = (event as CustomEvent<SessionUser>).detail;
      if (!detail?.id || detail.id === "unknown") return;
      cachedSessionRef.current = detail;
      setSessionVersion((current) => current + 1);
    };

    window.addEventListener("sigapro-platform-session-updated", handleSessionUpdated);
    return () => {
      window.removeEventListener("sigapro-platform-session-updated", handleSessionUpdated);
    };
  }, []);

  useEffect(() => {
    if (authenticatedUserId) {
      cachedSessionRef.current = session;
      writeCachedSession(session);
      return;
    }

    if (!authLoading && !cachedSessionRef.current) {
      cachedSessionRef.current = null;
      writeCachedSession(null);
    }
  }, [authLoading, authenticatedUserId, session]);

  const candidates = session.id !== "unknown" ? [session] : [];

  return (
    <PlatformSessionContext.Provider
      value={{
        session,
        sessions: candidates,
        setActiveSession: () => {},
      }}
    >
      {children}
    </PlatformSessionContext.Provider>
  );
}

export function usePlatformSession() {
  const context = useContext(PlatformSessionContext);
  if (!context) {
    throw new Error("usePlatformSession must be used inside PlatformSessionProvider");
  }
  return context;
}
