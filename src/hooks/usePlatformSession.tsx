/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react";
import { SessionUser, roleLabels } from "@/lib/platform";
import { useAuthGateway } from "@/hooks/useAuthGateway";

interface PlatformSessionContextValue {
  session: SessionUser;
  sessions: SessionUser[];
  setActiveSession: (userId: string) => void;
}

const PlatformSessionContext = createContext<PlatformSessionContextValue | null>(null);

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
  } = useAuthGateway();

  const session = useMemo<SessionUser>(() => {
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
  }, [authenticatedEmail, authenticatedMunicipalityId, authenticatedRole, authenticatedUserId]);

  const candidates = authenticatedUserId ? [session] : [];

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
