/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
import { createContext, useContext, useMemo } from "react";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";

interface AuthGatewayContextValue {
  isAuthenticated: boolean;
  loading: boolean;
  authResolved: boolean;
  authenticatedUserId: string | null;
  authenticatedProfileId: string | null;
  authenticatedRole: string | null;
  authenticatedAccessLevel: 1 | 2 | 3 | null;
  authenticatedEmail: string | null;
  authenticatedMunicipalityId: string | null;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; message?: string; role?: string; municipalityId?: string | null }>;
  resetPassword: (email: string) => Promise<{ ok: boolean; message?: string }>;
  updateEmail: (email: string) => Promise<{ ok: boolean; message?: string }>;
  updatePassword: (password: string, currentPassword?: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
}

const AuthGatewayContext = createContext<AuthGatewayContextValue | null>(null);
const authGatewayFallback: AuthGatewayContextValue = {
  isAuthenticated: false,
  loading: false,
  authResolved: true,
  authenticatedUserId: null,
  authenticatedProfileId: null,
  authenticatedRole: null,
  authenticatedAccessLevel: null,
  authenticatedEmail: null,
  authenticatedMunicipalityId: null,
  signIn: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  resetPassword: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  updateEmail: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  updatePassword: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  signOut: async () => {},
};

function useAuthGatewayValue(): AuthGatewayContextValue {
  const bootstrap = useAppBootstrap();

  return useMemo<AuthGatewayContextValue>(
    () => ({
      isAuthenticated: Boolean(bootstrap.authUserId),
      loading: bootstrap.loading,
      authResolved: bootstrap.authResolved,
      authenticatedUserId: bootstrap.authUserId,
      authenticatedProfileId: bootstrap.profile?.userId ?? null,
      authenticatedRole: bootstrap.role,
      authenticatedAccessLevel: bootstrap.profile?.accessLevel ?? null,
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
            const transientKeys = [
              "sigapro.platform.session.v1",
              "sigapro-platform-store",
              "sigapro-platform-store.v2",
              "sigapro:legacy-process-reconciliation-pending",
              "sigapro-supabase-auth",
            ];
            transientKeys.forEach((key) => localStorage.removeItem(key));

            for (let i = localStorage.length - 1; i >= 0; i -= 1) {
              const key = localStorage.key(i);
              if (key && key.startsWith("sb-")) {
                localStorage.removeItem(key);
              }
            }
            // Rascunhos sigapro-protocol-draft:* são preservados de propósito.
          } catch {
            // ignore
          }
          window.location.replace("/acesso");
        }
      },
    }),
    [
      bootstrap.authEmail,
      bootstrap.authResolved,
      bootstrap.authUserId,
      bootstrap.profile?.userId,
      bootstrap.loading,
      bootstrap.profile?.municipalityId,
      bootstrap.resetPassword,
      bootstrap.role,
      bootstrap.profile?.accessLevel,
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
  return context ?? authGatewayFallback;
}

export { authGatewayFallback };
