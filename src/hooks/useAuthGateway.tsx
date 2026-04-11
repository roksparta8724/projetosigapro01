import { createContext, useContext, useMemo } from "react";
import { sessionUsers, type AccountStatus, type SessionUser } from "@/lib/platform";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";

interface AuthGatewayContextValue {
  isAuthenticated: boolean;
  loading: boolean;
  authenticatedUserId: string | null;
  authenticatedRole: string | null;
  authenticatedEmail: string | null;
  authenticatedMunicipalityId: string | null;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; message?: string; role?: string }>;
  resetPassword: (email: string) => Promise<{ ok: boolean; message?: string }>;
  updateEmail: (email: string) => Promise<{ ok: boolean; message?: string }>;
  updatePassword: (password: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
}

const PLATFORM_STORE_KEY = "sigapro-platform-store";

const AuthGatewayContext = createContext<AuthGatewayContextValue | null>(null);
const authGatewayFallback: AuthGatewayContextValue = {
  isAuthenticated: false,
  loading: false,
  authenticatedUserId: null,
  authenticatedRole: null,
  authenticatedEmail: null,
  authenticatedMunicipalityId: null,
  signIn: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  resetPassword: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  updateEmail: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  updatePassword: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  signOut: async () => {},
};

function readCurrentSessionUsers() {
  if (typeof window === "undefined") {
    return sessionUsers;
  }

  try {
    const raw = window.localStorage.getItem(PLATFORM_STORE_KEY);
    if (!raw) return sessionUsers;
    const parsed = JSON.parse(raw) as { sessionUsers?: SessionUser[] };
    return parsed.sessionUsers?.length ? parsed.sessionUsers : sessionUsers;
  } catch {
    return sessionUsers;
  }
}

function resolveStoredUser(_email: string | null | undefined, userId?: string | null) {
  if (!userId) return undefined;
  const users = readCurrentSessionUsers();
  return users.find((item) => item.id === userId) ?? sessionUsers.find((item) => item.id === userId);
}

function isAdministrativeBlocked(status: AccountStatus | undefined) {
  return status === "blocked" || status === "inactive";
}

function blockedAccountMessage(status: AccountStatus | undefined) {
  return status === "inactive"
    ? "Esta conta foi desativada administrativamente. Entre em contato com a gestão do sistema."
    : "Esta conta está bloqueada administrativamente. Entre em contato com a gestão do sistema.";
}

function useAuthGatewayValue(): AuthGatewayContextValue {
  const bootstrap = useAppBootstrap();

  return useMemo<AuthGatewayContextValue>(
    () => ({
      isAuthenticated: Boolean(bootstrap.authUserId),
      loading: bootstrap.loading,
      authenticatedUserId: bootstrap.authUserId,
      authenticatedRole: bootstrap.role,
      authenticatedEmail: bootstrap.authEmail,
      authenticatedMunicipalityId:
        bootstrap.scopeType === "platform" ? null : bootstrap.profile?.municipalityId ?? null,
      signIn: bootstrap.signIn,
      resetPassword: bootstrap.resetPassword,
      updateEmail: bootstrap.updateEmail,
      updatePassword: bootstrap.updatePassword,
      signOut: async () => {
        console.log("[Logout] signOut start");
        await bootstrap.signOut();
        console.log("[Logout] signOut result");
        if (typeof window !== "undefined") {
          try {
            for (let i = localStorage.length - 1; i >= 0; i -= 1) {
              const key = localStorage.key(i);
              if (key && key.startsWith("sb-")) {
                localStorage.removeItem(key);
              }
            }
          } catch {
            // ignore
          }
          window.location.replace("/acesso");
        }
      },
    }),
    [
      bootstrap.authEmail,
      bootstrap.authUserId,
      bootstrap.loading,
      bootstrap.profile?.municipalityId,
      bootstrap.resetPassword,
      bootstrap.role,
      bootstrap.signIn,
      bootstrap.signOut,
      bootstrap.updateEmail,
      bootstrap.updatePassword,
      bootstrap.scopeType,
    ],
  );
}

export function AuthGatewayProvider({ children }: { children: React.ReactNode }) {
  const value = useAuthGatewayValue();
  return <AuthGatewayContext.Provider value={value}>{children}</AuthGatewayContext.Provider>;
}

export function useAuthGateway() {
  const context = useContext(AuthGatewayContext);
  return context ?? useAuthGatewayValue();
}

export { authGatewayFallback, resolveStoredUser, isAdministrativeBlocked, blockedAccountMessage };
