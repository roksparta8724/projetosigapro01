import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import { sessionUsers, type AccountStatus, type SessionUser } from "@/lib/platform";

interface AuthGatewayContextValue {
  isAuthenticated: boolean;
  loading: boolean;
  authenticatedUserId: string | null;
  authenticatedRole: string | null;
  authenticatedEmail: string | null;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string; role?: string }>;
  resetPassword: (email: string, newPassword: string) => Promise<{ ok: boolean; message?: string }>;
  updateEmail: (email: string) => Promise<{ ok: boolean; message?: string }>;
  updatePassword: (password: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
}

const demoCredentials: Record<string, { password: string; userId: string; role: string }> = {
  "roksparta02@gmail.com": { password: "Sigapro@2026", userId: "u-master", role: "master_admin" },
  "camila@campolimpopaulista.sp.gov.br": { password: "Prefeitura@2026", userId: "u-admin-clp", role: "prefeitura_admin" },
  "marcelo@campolimpopaulista.sp.gov.br": { password: "Analise@2026", userId: "u-analyst-clp", role: "analista" },
  "fernanda@campolimpopaulista.sp.gov.br": { password: "Financeiro@2026", userId: "u-fin-clp", role: "financeiro" },
  "patricia@estudiomoraes.com.br": { password: "Profissional@2026", userId: "u-ext-1", role: "profissional_externo" },
  "sergio@dominio.com": { password: "Consulta@2026", userId: "u-owner-1", role: "property_owner" },
};

const MASTER_EMAIL = "roksparta02@gmail.com";
const MASTER_NAME = "Jonatas Rodrigues";

const STORAGE_KEY = "sigapro-auth";
const DYNAMIC_CREDENTIALS_KEY = "sigapro-demo-credentials";
const PLATFORM_STORE_KEY = "sigapro-platform-store";

const AuthGatewayContext = createContext<AuthGatewayContextValue | null>(null);
const authGatewayFallback: AuthGatewayContextValue = {
  isAuthenticated: false,
  loading: false,
  authenticatedUserId: null,
  authenticatedRole: null,
  authenticatedEmail: null,
  signIn: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  resetPassword: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  updateEmail: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  updatePassword: async () => ({ ok: false, message: "Autenticação indisponível no momento." }),
  signOut: async () => {},
};

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

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

function resolveStoredUser(email: string | null | undefined, userId?: string | null) {
  const normalized = normalizeEmail(email);
  const users = readCurrentSessionUsers();
  return (
    users.find((item) => (userId ? item.id === userId : false)) ??
    users.find((item) => normalizeEmail(item.email) === normalized) ??
    sessionUsers.find((item) => normalizeEmail(item.email) === normalized)
  );
}

function isAdministrativeBlocked(status: AccountStatus | undefined) {
  return status === "blocked" || status === "inactive";
}

function blockedAccountMessage(status: AccountStatus | undefined) {
  return status === "inactive"
    ? "Esta conta foi desativada administrativamente. Entre em contato com a gestao do sistema."
    : "Esta conta esta bloqueada administrativamente. Entre em contato com a gestao do sistema.";
}

async function ensureMasterProfile(userId: string | null | undefined, email?: string | null) {
  if (!supabase || !userId) return;
  if (normalizeEmail(email) !== MASTER_EMAIL) return;

  try {
    await supabase.from("profiles").upsert(
      {
        user_id: userId,
        full_name: MASTER_NAME,
        email: MASTER_EMAIL,
        role: "master_admin",
      },
      { onConflict: "user_id" },
    );
  } catch {
    // noop: perfil segue carregando pelas regras atuais
  }
}

export function AuthGatewayProvider({ children }: { children: React.ReactNode }) {
  const persisted = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
  const parsed = persisted ? JSON.parse(persisted) : null;
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(parsed?.userId ?? null);
  const [authenticatedRole, setAuthenticatedRole] = useState<string | null>(parsed?.role ?? null);
  const [authenticatedEmail, setAuthenticatedEmail] = useState<string | null>(parsed?.email ?? null);
  const [loading] = useState(false);

  useEffect(() => {
    if (!hasSupabaseEnv || !supabase) return;

    const resolveRole = (email?: string | null, fallbackRole?: string | null) => {
      const normalized = email?.trim().toLowerCase() || "";
      const fallbackProfile = sessionUsers.find((item) => item.email.toLowerCase() === normalized);
      return fallbackRole || fallbackProfile?.role || "profissional_externo";
    };

    const resolveProfileRole = async (userId: string, email?: string | null) => {
      if (!supabase) return resolveRole(email, null);
      try {
        const { data } = await supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle();
        return (data?.role as string | null) ?? resolveRole(email, null);
      } catch {
        return resolveRole(email, null);
      }
    };

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) return;
      const role =
        (data.session.user.app_metadata?.role as string | undefined) ??
        (await resolveProfileRole(data.session.user.id, data.session.user.email));
      await ensureMasterProfile(data.session.user.id, data.session.user.email);
      const payload = { userId: data.session.user.id, role, email: data.session.user.email?.trim().toLowerCase() ?? null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setAuthenticatedUserId(payload.userId);
      setAuthenticatedRole(payload.role);
      setAuthenticatedEmail(payload.email);
    });

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        localStorage.removeItem(STORAGE_KEY);
        setAuthenticatedUserId(null);
        setAuthenticatedRole(null);
        setAuthenticatedEmail(null);
        return;
      }

      const role =
        (session.user.app_metadata?.role as string | undefined) ??
        (await resolveProfileRole(session.user.id, session.user.email));
      await ensureMasterProfile(session.user.id, session.user.email);
      const payload = { userId: session.user.id, role, email: session.user.email?.trim().toLowerCase() ?? null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setAuthenticatedUserId(payload.userId);
      setAuthenticatedRole(payload.role);
      setAuthenticatedEmail(payload.email);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthGatewayContextValue>(
    () => ({
      isAuthenticated: Boolean(authenticatedUserId),
      loading,
      authenticatedUserId,
      authenticatedRole,
      authenticatedEmail,
      signIn: async (email, password) => {
        const normalized = normalizeEmail(email);
        const masterCredential = demoCredentials["roksparta02@gmail.com"];

        if (hasSupabaseEnv && supabase) {
          const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
          if (!error && data.user) {
            await ensureMasterProfile(data.user.id, data.user.email);
            const fallbackProfile = resolveStoredUser(normalized, data.user.id);
            if (isAdministrativeBlocked(fallbackProfile?.accountStatus)) {
              await supabase.auth.signOut();
              return {
                ok: false,
                message: blockedAccountMessage(fallbackProfile?.accountStatus),
              };
            }
            const payload = {
              userId: data.user.id,
              role: (data.user.app_metadata?.role as string | undefined) ?? fallbackProfile?.role ?? "profissional_externo",
              email: normalized,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            setAuthenticatedUserId(payload.userId);
            setAuthenticatedRole(payload.role);
            setAuthenticatedEmail(payload.email);
            return { ok: true, role: payload.role };
          }

          return {
            ok: false,
            message: error?.message || "Não foi possível autenticar no Supabase.",
          };
        }

        if (normalized === "roksparta02@gmail.com" && password === masterCredential.password) {
          const fallbackProfile = resolveStoredUser(normalized, masterCredential.userId);
          if (isAdministrativeBlocked(fallbackProfile?.accountStatus)) {
            return { ok: false, message: blockedAccountMessage(fallbackProfile?.accountStatus) };
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId: masterCredential.userId, role: masterCredential.role, email: normalized }));
          setAuthenticatedUserId(masterCredential.userId);
          setAuthenticatedRole(masterCredential.role);
          setAuthenticatedEmail(normalized);
          return { ok: true, role: masterCredential.role };
        }

        const dynamicCredentialsRaw = localStorage.getItem(DYNAMIC_CREDENTIALS_KEY);
        const dynamicCredentials = dynamicCredentialsRaw
          ? (JSON.parse(dynamicCredentialsRaw) as Record<string, { password: string; userId: string; role: string }>)
          : {};

        const credential = dynamicCredentials[normalized] ?? demoCredentials[normalized];
        if (!credential || credential.password !== password) {
          return { ok: false, message: "E-mail ou senha invalidos." };
        }

        const fallbackProfile = resolveStoredUser(normalized, credential.userId);
        if (isAdministrativeBlocked(fallbackProfile?.accountStatus)) {
          return { ok: false, message: blockedAccountMessage(fallbackProfile?.accountStatus) };
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId: credential.userId, role: credential.role, email: normalized }));
        setAuthenticatedUserId(credential.userId);
        setAuthenticatedRole(credential.role);
        setAuthenticatedEmail(normalized);
        return { ok: true, role: credential.role };
      },
      resetPassword: async (email, newPassword) => {
        const normalized = email.trim().toLowerCase();

        if (hasSupabaseEnv && supabase) {
          const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
            redirectTo: `${window.location.origin}/acesso`,
          });
          if (!error) {
            return { ok: true, message: "Instrucao de redefinicao enviada para o e-mail informado." };
          }
        }

        const existingDynamicRaw = localStorage.getItem(DYNAMIC_CREDENTIALS_KEY);
        const existingDynamic = existingDynamicRaw
          ? (JSON.parse(existingDynamicRaw) as Record<string, { password: string; userId: string; role: string }>)
          : {};
        const existing = existingDynamic[normalized] ?? demoCredentials[normalized];
        if (!existing) {
          return { ok: false, message: "Não encontramos esse e-mail na base de teste." };
        }

        const nextDynamic = {
          ...existingDynamic,
          [normalized]: {
            userId: existing.userId,
            role: existing.role,
            password: newPassword,
          },
        };
        localStorage.setItem(DYNAMIC_CREDENTIALS_KEY, JSON.stringify(nextDynamic));
        return { ok: true, message: "Senha atualizada com sucesso para este perfil de teste." };
      },
      updateEmail: async (email) => {
        const normalized = email.trim().toLowerCase();
        if (!normalized) {
          return { ok: false, message: "Informe um e-mail valido." };
        }

        if (hasSupabaseEnv && supabase) {
          const { error } = await supabase.auth.updateUser({ email: normalized });
          if (error) {
            return { ok: false, message: error.message || "Não foi possível atualizar o e-mail." };
          }

          const nextPayload = {
            userId: authenticatedUserId,
            role: authenticatedRole,
            email: normalized,
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPayload));
          setAuthenticatedEmail(normalized);
          return {
            ok: true,
            message: "Solicitacao de troca de e-mail enviada. Confirme o novo endereco para concluir a alteracao.",
          };
        }

        const existingDynamicRaw = localStorage.getItem(DYNAMIC_CREDENTIALS_KEY);
        const existingDynamic = existingDynamicRaw
          ? (JSON.parse(existingDynamicRaw) as Record<string, { password: string; userId: string; role: string }>)
          : {};
        const currentEmail = authenticatedEmail?.trim().toLowerCase() ?? "";
        const currentCredential = existingDynamic[currentEmail] ?? demoCredentials[currentEmail];
        if (!currentCredential || !currentEmail) {
          return { ok: false, message: "Não foi possível localizar a conta atual." };
        }

        const nextDynamic = { ...existingDynamic };
        delete nextDynamic[currentEmail];
        nextDynamic[normalized] = currentCredential;
        localStorage.setItem(DYNAMIC_CREDENTIALS_KEY, JSON.stringify(nextDynamic));
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ userId: currentCredential.userId, role: currentCredential.role, email: normalized }),
        );
        setAuthenticatedEmail(normalized);
        return { ok: true, message: "E-mail atualizado com sucesso." };
      },
      updatePassword: async (password) => {
        if (!password || password.trim().length < 8) {
          return { ok: false, message: "A nova senha deve ter pelo menos 8 caracteres." };
        }

        if (hasSupabaseEnv && supabase) {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) {
            return { ok: false, message: error.message || "Não foi possível atualizar a senha." };
          }
          return { ok: true, message: "Senha atualizada com sucesso." };
        }

        const currentEmail = authenticatedEmail?.trim().toLowerCase() ?? "";
        const existingDynamicRaw = localStorage.getItem(DYNAMIC_CREDENTIALS_KEY);
        const existingDynamic = existingDynamicRaw
          ? (JSON.parse(existingDynamicRaw) as Record<string, { password: string; userId: string; role: string }>)
          : {};
        const currentCredential = existingDynamic[currentEmail] ?? demoCredentials[currentEmail];
        if (!currentCredential || !currentEmail) {
          return { ok: false, message: "Não foi possível localizar a conta atual." };
        }

        localStorage.setItem(
          DYNAMIC_CREDENTIALS_KEY,
          JSON.stringify({
            ...existingDynamic,
            [currentEmail]: {
              ...currentCredential,
              password,
            },
          }),
        );
        return { ok: true, message: "Senha atualizada com sucesso." };
      },
      signOut: async () => {
        try {
          if (hasSupabaseEnv && supabase) {
            await Promise.race([
              supabase.auth.signOut(),
              new Promise((resolve) => setTimeout(resolve, 1200)),
            ]);
          }
        } catch {
          // keep local cleanup even if remote signOut fails
        }
        if (typeof window !== "undefined") {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(PLATFORM_STORE_KEY);
          localStorage.removeItem("sigapro-layout-theme");
          try {
            for (let i = localStorage.length - 1; i >= 0; i -= 1) {
              const key = localStorage.key(i);
              if (key && key.startsWith("sb-")) {
                localStorage.removeItem(key);
              }
            }
          } catch {
            // ignore storage cleanup errors
          }
        }
        setAuthenticatedUserId(null);
        setAuthenticatedRole(null);
        setAuthenticatedEmail(null);
      },
    }),
    [authenticatedEmail, authenticatedRole, authenticatedUserId, loading],
  );

  return <AuthGatewayContext.Provider value={value}>{children}</AuthGatewayContext.Provider>;
}

export function useAuthGateway() {
  const context = useContext(AuthGatewayContext);
  return context ?? authGatewayFallback;
}

