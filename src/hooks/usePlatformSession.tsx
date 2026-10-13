/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SessionUser, roleLabels } from "@/lib/platform";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";
import { isNeonBackend } from "@/integrations/backend/config";

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
  if (raw === "master_admin" || raw === "admin_master" || raw === "master") return "master_admin";
  if (raw === "prefeitura_admin" || raw === "admin_municipality" || raw === "admin_prefeitura") {
    return "prefeitura_admin";
  }
  if (raw === "prefeitura_supervisor" || raw === "secretario" || raw === "diretor") {
    return "prefeitura_supervisor";
  }
  if (raw === "master_ops") return "master_ops";
  if (raw === "profissional_externo" || raw === "professional_external" || raw === "professional" || raw === "profissional") {
    return "profissional_externo";
  }
  if (raw === "property_owner") return "property_owner";
  if (raw === "proprietario_consulta") return "proprietario_consulta";
  if (raw === "financeiro" || raw === "financial") return "financeiro";
  if (raw === "analista" || raw === "analyst") return "analista";
  if (raw === "setor_intersetorial") return "setor_intersetorial";
  if (raw === "fiscal") return "fiscal";
  return "proprietario_consulta";
}

export function PlatformSessionProvider({ children }: { children: React.ReactNode }) {
  const {
    authenticatedEmail,
    authenticatedRole,
    authenticatedAccessLevel,
    authenticatedUserId,
    authenticatedProfileId,
    authenticatedMunicipalityId,
    authResolved,
    loading: authLoading,
  } = useAuthGateway();
  const { sessionUsers } = usePlatformData();
  const cachedSessionRef = useRef<SessionUser | null>(readCachedSession());
  const [sessionVersion, setSessionVersion] = useState(0);
  const businessUserId = authenticatedProfileId || authenticatedUserId;
  const canonicalSessionUser = useMemo(
    () =>
      sessionUsers.find((item) => item.id === businessUserId) ??
      sessionUsers.find(
        (item) =>
          Boolean(authenticatedEmail) &&
          item.email?.trim().toLowerCase() === authenticatedEmail?.trim().toLowerCase(),
      ) ??
      null,
    [authenticatedEmail, businessUserId, sessionUsers],
  );

  const session = useMemo<SessionUser>(() => {
    const cachedSession = cachedSessionRef.current;
    const canUseCachedSession = !businessUserId && (isNeonBackend || !authResolved);

    if (cachedSession && (canUseCachedSession || cachedSession.id === businessUserId || canonicalSessionUser?.id === businessUserId)) {
      const safeRole = normalizeRole(
        canonicalSessionUser?.role ??
        (businessUserId ? authenticatedRole : cachedSession.role),
      );
      return {
        ...cachedSession,
        ...(canonicalSessionUser ?? {}),
        id: canonicalSessionUser?.id || businessUserId || cachedSession.id,
        role: safeRole,
        accessLevel:
          safeRole === "master_admin" || safeRole === "prefeitura_admin"
            ? 3
            : canonicalSessionUser?.accessLevel ??
              (authResolved && businessUserId
                ? authenticatedAccessLevel ?? (safeRole === "prefeitura_supervisor" ? 2 : 1)
                : cachedSession.accessLevel ?? 1),
        tenantId:
          canonicalSessionUser?.tenantId ??
          canonicalSessionUser?.municipalityId ??
          (businessUserId ? authenticatedMunicipalityId : cachedSession.tenantId ?? null),
        municipalityId:
          canonicalSessionUser?.municipalityId ??
          canonicalSessionUser?.tenantId ??
          (businessUserId ? authenticatedMunicipalityId : cachedSession.municipalityId ?? null),
        title:
          canonicalSessionUser?.title ||
          cachedSession.title ||
          roleLabels[safeRole] ||
          "Usuário",
        department:
          canonicalSessionUser?.department ||
          cachedSession.department ||
          "",
        email: authenticatedEmail || canonicalSessionUser?.email || cachedSession.email || "",
      };
    }

    const safeRole = normalizeRole(canonicalSessionUser?.role ?? authenticatedRole);
    const email = authenticatedEmail || canonicalSessionUser?.email || "";
    return {
      ...(canonicalSessionUser ?? {}),
      id: canonicalSessionUser?.id || businessUserId || "unknown",
      name:
        canonicalSessionUser?.name ||
        email
          .split("@")[0]
          ?.replace(/[._-]/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase()) ||
        "Usuário autenticado",
      role: safeRole,
      accessLevel:
        safeRole === "master_admin" || safeRole === "prefeitura_admin"
          ? 3
          : canonicalSessionUser?.accessLevel ??
            authenticatedAccessLevel ??
            (safeRole === "prefeitura_supervisor" ? 2 : 1),
      tenantId:
        canonicalSessionUser?.tenantId ??
        canonicalSessionUser?.municipalityId ??
        authenticatedMunicipalityId ??
        null,
      municipalityId:
        canonicalSessionUser?.municipalityId ??
        canonicalSessionUser?.tenantId ??
        authenticatedMunicipalityId ??
        null,
      title: canonicalSessionUser?.title || roleLabels[safeRole] || "Usuário",
      email,
      accountStatus: canonicalSessionUser?.accountStatus ?? "active",
      userType: canonicalSessionUser?.userType || "Usuário",
      department: canonicalSessionUser?.department || "",
      createdAt: canonicalSessionUser?.createdAt || "",
      lastAccessAt: canonicalSessionUser?.lastAccessAt || "",
      blockedAt: canonicalSessionUser?.blockedAt ?? null,
      blockedBy: canonicalSessionUser?.blockedBy ?? null,
      blockReason: canonicalSessionUser?.blockReason ?? null,
      deletedAt: canonicalSessionUser?.deletedAt ?? null,
    };
  }, [authLoading, authResolved, authenticatedAccessLevel, authenticatedEmail, authenticatedMunicipalityId, authenticatedRole, authenticatedUserId, authenticatedProfileId, businessUserId, canonicalSessionUser, sessionVersion]);

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
    if (businessUserId) {
      cachedSessionRef.current = session;
      writeCachedSession(session);
      return;
    }

    if (authResolved && !businessUserId) {
      // No Neon, eventos transitórios de auth não podem apagar a sessão visual já estável.
      // O logout confirmado remove a chave pelo AppBootstrap; aí sim limpamos o contexto.
      if (isNeonBackend && readCachedSession()) return;
      if (!cachedSessionRef.current) {
        writeCachedSession(null);
        return;
      }
      cachedSessionRef.current = null;
      writeCachedSession(null);
      setSessionVersion((current) => current + 1);
      return;
    }

    if (!authLoading && !cachedSessionRef.current) {
      cachedSessionRef.current = null;
      writeCachedSession(null);
    }
  }, [authLoading, authResolved, authenticatedUserId, session]);

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
