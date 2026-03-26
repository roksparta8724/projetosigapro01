import { createContext, useContext, useMemo, useState } from "react";
import { SessionUser, roleLabels, sessionUsers as demoSessionUsers } from "@/lib/platform";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";

interface PlatformSessionContextValue {
  session: SessionUser;
  sessions: SessionUser[];
  setActiveSession: (userId: string) => void;
}

const PlatformSessionContext = createContext<PlatformSessionContextValue | null>(null);

export function PlatformSessionProvider({ children }: { children: React.ReactNode }) {
  const { sessionUsers } = usePlatformData();
  const { authenticatedEmail, authenticatedRole, authenticatedUserId } = useAuthGateway();
  const [activeSessionId, setActiveSessionId] = useState("");
  const allCandidates = useMemo(() => {
    const merged = [...sessionUsers];
    demoSessionUsers.forEach((entry) => {
      if (!merged.some((item) => item.id === entry.id || item.email.toLowerCase() === entry.email.toLowerCase())) {
        merged.push(entry);
      }
    });
    return merged.length > 0 ? merged : demoSessionUsers;
  }, [sessionUsers]);
  const signedUser =
    allCandidates.find((entry) => entry.id === authenticatedUserId) ??
    allCandidates.find((entry) => entry.email.toLowerCase() === authenticatedEmail?.toLowerCase());
  const fallbackAuthSession = useMemo<SessionUser | null>(() => {
    if (!authenticatedUserId || !authenticatedRole) return null;
    return {
      id: authenticatedUserId,
      name: authenticatedEmail?.split("@")[0]?.replace(/[._-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) || "Usuário autenticado",
      role: authenticatedRole as SessionUser["role"],
      accessLevel: authenticatedRole === "master_admin" || authenticatedRole === "prefeitura_admin" ? 3 : authenticatedRole === "prefeitura_supervisor" ? 2 : 1,
      tenantId: null,
      title: roleLabels[authenticatedRole as SessionUser["role"]] || "Usuário",
      email: authenticatedEmail || "",
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
  }, [authenticatedEmail, authenticatedRole, authenticatedUserId]);
  const canSwitchProfiles = authenticatedRole === "master_admin" || authenticatedRole === "master_ops";
  const candidates = canSwitchProfiles
    ? fallbackAuthSession
      ? [fallbackAuthSession, ...allCandidates]
      : allCandidates
    : signedUser
      ? [signedUser]
      : fallbackAuthSession
        ? [fallbackAuthSession]
        : [allCandidates[0]];
  const session = candidates.find((entry) => entry.id === activeSessionId) ?? signedUser ?? fallbackAuthSession ?? candidates[0];

  return (
    <PlatformSessionContext.Provider
      value={{
        session,
        sessions: candidates,
        setActiveSession: (userId: string) => {
          if (canSwitchProfiles || userId === signedUser?.id) {
            setActiveSessionId(userId);
          }
        },
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
