import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import {
  loadCurrentMunicipalityBundle,
  loadMunicipalityBundleById,
} from "@/integrations/supabase/municipality";
import { resolveTenantFromLocation } from "@/lib/tenant";
import type { MunicipalityBundle } from "@/lib/municipality";
import type { UserRole } from "@/lib/platform";

interface AppBootstrapProfile {
  userId: string;
  role: string | null;
  municipalityId: string | null;
  email?: string | null;
  fullName?: string | null;
}

interface AppBootstrapState {
  loading: boolean;
  isReady: boolean;
  error: string | null;
  authUserId: string | null;
  authEmail: string | null;
  role: UserRole | null;
  profile: AppBootstrapProfile | null;
  scopeType: "platform" | "municipality" | "external";
  municipalityBundle: MunicipalityBundle | null;
  resolution: ReturnType<typeof resolveTenantFromLocation>;
  refreshMunicipalityBundle: (municipalityId?: string | null) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string; role?: string }>;
  resetPassword: (email: string) => Promise<{ ok: boolean; message?: string }>;
  updateEmail: (email: string) => Promise<{ ok: boolean; message?: string }>;
  updatePassword: (password: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
}

const AppBootstrapContext = createContext<AppBootstrapState | null>(null);

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function mapDbRoleCodeToAppRole(code: string | null | undefined): UserRole | null {
  if (!code) return null;
  const c = code.trim();
  const aliases: Record<string, UserRole> = {
    master_admin: "master_admin",
    admin_master: "master_admin",
    master_ops: "master_ops",
    prefeitura_admin: "prefeitura_admin",
    admin_municipality: "prefeitura_admin",
    prefeitura_supervisor: "prefeitura_supervisor",
    analista: "analista",
    analyst: "analista",
    financeiro: "financeiro",
    financial: "financeiro",
    setor_intersetorial: "setor_intersetorial",
    fiscal: "fiscal",
    profissional_externo: "profissional_externo",
    professional_external: "profissional_externo",
    proprietario_consulta: "proprietario_consulta",
    property_owner: "property_owner",
  };
  return aliases[c] ?? aliases[c.toLowerCase()] ?? null;
}

async function loadProfileByUserId(userId: string): Promise<AppBootstrapProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, role, municipality_id, email, full_name")
    .eq("user_id", userId)
    .limit(2);

  if (error) {
    console.warn("[Bootstrap][Profile] Falha ao carregar profile", { error });
    return null;
  }
  if (!data || data.length === 0) {
    console.warn("[Bootstrap][Profile] Nenhum profile encontrado", { userId });
    return null;
  }
  if (data.length > 1) {
    console.error("[Bootstrap][Profile] Multiplos profiles para o mesmo user_id", { userId });
  }
  const record = data[0];
  return {
    userId: record.user_id,
    role: record.role ?? null,
    municipalityId: record.municipality_id ?? null,
    email: record.email ?? null,
    fullName: record.full_name ?? null,
  };
}

export function AppBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [profile, setProfile] = useState<AppBootstrapProfile | null>(null);
  const [scopeType, setScopeType] = useState<"platform" | "municipality" | "external">("municipality");
  const [municipalityBundle, setMunicipalityBundle] = useState<MunicipalityBundle | null>(null);
  const [resolution] = useState(() => resolveTenantFromLocation());
  const runningRef = useRef(false);
  const initializedRef = useRef(false);
  const lastAuthUserIdRef = useRef<string | null>(null);
  const refreshRef = useRef(false);
  const lastStableRef = useRef({
    authUserId: null as string | null,
    authEmail: null as string | null,
    role: null as UserRole | null,
    profile: null as AppBootstrapProfile | null,
    municipalityBundle: null as MunicipalityBundle | null,
  });
  const authEventRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasSupabaseEnv || !supabase) {
      setLoading(false);
      setIsReady(true);
      return;
    }

    let active = true;

    const runBootstrap = async (event?: string | null) => {
      if (runningRef.current) return;
      runningRef.current = true;
      if (!initializedRef.current) {
        setLoading(true);
      }
      setError(null);

      try {
        console.log("[Bootstrap] Iniciando", { event: event ?? authEventRef.current });
        const userResult = await supabase.auth.getUser();
        const authUser = userResult.data.user ?? null;
        if (!active) return;

        if (event === "TOKEN_REFRESHED" && authUser?.id && lastAuthUserIdRef.current === authUser.id) {
          console.log("[Bootstrap] Refresh token sem mudanca de usuario");
          setIsReady(true);
          return;
        }

        if (!authUser) {
          if (authEventRef.current && authEventRef.current !== "SIGNED_OUT") {
            console.warn("[Bootstrap] Auth transitório sem user, preservando estado", {
              event: authEventRef.current,
            });
            setIsReady(true);
            return;
          }
          console.warn("[Bootstrap] Sem usuário autenticado");
          setAuthUserId(null);
          setAuthEmail(null);
          setRole(null);
          setProfile(null);
          setMunicipalityBundle(null);
          setIsReady(true);
          return;
        }

        const nextProfile = await loadProfileByUserId(authUser.id);
        const mappedRole =
          mapDbRoleCodeToAppRole(nextProfile?.role) ??
          mapDbRoleCodeToAppRole(authUser.app_metadata?.role as string | undefined) ??
          "profissional_externo";

        const nextScopeType: "platform" | "municipality" | "external" =
          mappedRole === "master_admin" || mappedRole === "master_ops"
            ? "platform"
            : mappedRole === "profissional_externo" || mappedRole === "proprietario_consulta" || mappedRole === "property_owner"
              ? "external"
              : "municipality";

        let nextBundle: MunicipalityBundle | null = null;
        if (nextScopeType !== "platform") {
          if (nextProfile?.municipalityId) {
            nextBundle = await loadMunicipalityBundleById(nextProfile.municipalityId);
          } else {
            nextBundle = await loadCurrentMunicipalityBundle({
              hostname: resolution.hostname,
              subdomain: resolution.subdomain,
              isLocalhost: resolution.isLocalhost,
              preferredName:
                (import.meta.env.VITE_DEV_MUNICIPALITY_NAME as string | undefined) ||
                "",
            });
          }
        }

        if (!active) return;
        setAuthUserId(authUser.id);
        setAuthEmail(normalizeEmail(authUser.email));
        setRole(mappedRole);
        setProfile(nextProfile);
        setScopeType(nextScopeType);
        setMunicipalityBundle(nextBundle);
        lastAuthUserIdRef.current = authUser.id;
        lastStableRef.current = {
          authUserId: authUser.id,
          authEmail: normalizeEmail(authUser.email),
          role: mappedRole,
          profile: nextProfile,
          municipalityBundle: nextBundle,
        };
        setIsReady(true);
        console.log("[Bootstrap] Concluido", {
          authUserId: authUser.id,
          role: mappedRole,
          scopeType: nextScopeType,
          municipalityId: nextBundle?.municipality?.id ?? null,
        });
        initializedRef.current = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha no bootstrap";
        console.error("[Bootstrap] Erro", { message });
        if (!active) return;
        setError(message);
        setIsReady(true);
        if (lastStableRef.current.authUserId) {
          console.warn("[Bootstrap] Mantendo estado estável após erro");
          setAuthUserId(lastStableRef.current.authUserId);
          setAuthEmail(lastStableRef.current.authEmail);
          setRole(lastStableRef.current.role);
          setProfile(lastStableRef.current.profile);
          setMunicipalityBundle(lastStableRef.current.municipalityBundle);
          setScopeType(
            lastStableRef.current.role === "master_admin" || lastStableRef.current.role === "master_ops"
              ? "platform"
              : "municipality",
          );
        }
      } finally {
        if (active) setLoading(false);
        runningRef.current = false;
      }
    };

    void runBootstrap("INITIAL_SESSION");

    const { data } = supabase.auth.onAuthStateChange(async (event) => {
      console.log("[Auth] onAuthStateChange", { event });
      authEventRef.current = event;
      if (event === "TOKEN_REFRESHED") {
        await runBootstrap(event);
        return;
      }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        await runBootstrap(event);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [resolution.hostname, resolution.isLocalhost, resolution.subdomain]);

  const value = useMemo<AppBootstrapState>(
    () => ({
      loading,
      isReady,
      error,
      authUserId,
      authEmail,
      role,
      profile,
      scopeType,
      municipalityBundle,
      resolution,
      refreshMunicipalityBundle: async (municipalityId?: string | null) => {
        if (!hasSupabaseEnv || !supabase) return;
        if (refreshRef.current) return;
        refreshRef.current = true;
        try {
          if (scopeType === "platform") {
            setMunicipalityBundle(null);
            return;
          }
          const next =
            municipalityId && municipalityId.trim()
              ? await loadMunicipalityBundleById(municipalityId)
              : await loadCurrentMunicipalityBundle({
                  hostname: resolution.hostname,
                  subdomain: resolution.subdomain,
                  isLocalhost: resolution.isLocalhost,
                  preferredName: "Campo Limpo Paulista",
                });
          setMunicipalityBundle(next);
        } finally {
          refreshRef.current = false;
        }
      },
      signIn: async (email, password) => {
        if (!hasSupabaseEnv || !supabase) {
          return { ok: false, message: "Supabase indisponivel." };
        }
        const normalized = normalizeEmail(email);
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalized,
          password,
        });
        if (signInError || !data.user) {
          return { ok: false, message: signInError?.message || "Falha ao autenticar." };
        }
        return { ok: true };
      },
      resetPassword: async (email) => {
        if (!hasSupabaseEnv || !supabase) {
          return { ok: false, message: "Supabase indisponivel." };
        }
        const normalized = normalizeEmail(email);
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
          redirectTo: `${window.location.origin}/recuperar-senha`,
        });
        if (resetError) return { ok: false, message: resetError.message };
        return { ok: true, message: "E-mail enviado." };
      },
      updateEmail: async (email) => {
        if (!hasSupabaseEnv || !supabase) {
          return { ok: false, message: "Supabase indisponivel." };
        }
        const normalized = normalizeEmail(email);
        const { error: updateError } = await supabase.auth.updateUser({ email: normalized });
        if (updateError) return { ok: false, message: updateError.message };
        return { ok: true, message: "E-mail atualizado." };
      },
      updatePassword: async (password) => {
        if (!hasSupabaseEnv || !supabase) {
          return { ok: false, message: "Supabase indisponivel." };
        }
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) return { ok: false, message: updateError.message };
        return { ok: true, message: "Senha atualizada." };
      },
      signOut: async () => {
        console.log("[Logout] signOut start (bootstrap)");
        authEventRef.current = "SIGNED_OUT";
        lastAuthUserIdRef.current = null;
        initializedRef.current = false;
        lastStableRef.current = {
          authUserId: null,
          authEmail: null,
          role: null,
          profile: null,
          municipalityBundle: null,
        };
        setLoading(true);
        try {
          if (hasSupabaseEnv && supabase) {
            await Promise.race([
              supabase.auth.signOut(),
              new Promise<void>((resolve) => {
                setTimeout(() => {
                  console.warn("[Logout] signOut timeout fallback");
                  resolve();
                }, 2500);
              }),
            ]);
          }
        } finally {
          setAuthUserId(null);
          setAuthEmail(null);
          setRole(null);
          setProfile(null);
          setScopeType("municipality");
          setMunicipalityBundle(null);
          setError(null);
          setIsReady(true);
          setLoading(false);
          console.log("[Logout] signOut done (bootstrap)");
        }
      },
    }),
    [authEmail, authUserId, error, isReady, loading, municipalityBundle, profile, resolution, role, scopeType],
  );

  return <AppBootstrapContext.Provider value={value}>{children}</AppBootstrapContext.Provider>;
}

export function useAppBootstrap() {
  const context = useContext(AppBootstrapContext);
  if (!context) {
    throw new Error("useAppBootstrap must be used inside AppBootstrapProvider");
  }
  return context;
}
