/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { backendClient, hasBackendEnv, neonAccountClient } from "@/integrations/backend/databaseClient";
import { isNeonBackend } from "@/integrations/backend/config";
import {
  loadCurrentMunicipalityBundle,
  loadMunicipalityBundleById,
} from "@/integrations/backend/municipality";
import {
  registerRemoteExternalAccount,
  registerRemoteOwnerAccount,
  saveRemoteProfile,
} from "@/integrations/backend/platform";
import { resolveTenantFromLocation } from "@/lib/tenant";
import type { MunicipalityBundle } from "@/lib/municipality";
import type { UserRole } from "@/lib/platform";
import { clearPendingSignup, readPendingSignup, type AuthUserLike } from "@/lib/pendingSignup";

const BOOTSTRAP_CACHE_KEY = "sigapro.bootstrap.snapshot.v1";
const BOOTSTRAP_SESSION_CACHE_KEY = "sigapro.bootstrap.session-snapshot.v1";
const NEON_BROWSER_BOOTSTRAP_CACHE_KEY = "sigapro.bootstrap.neon-browser.v1";
const NEON_BROWSER_SESSION_COOKIE = "sigapro_browser_session_v1";
const PLATFORM_SESSION_CACHE_KEY = "sigapro.platform.session.v1";

type BootstrapAuthUser = AuthUserLike & { id: string };

interface AppBootstrapProfile {
  userId: string;
  role: string | null;
  municipalityId: string | null;
  accessLevel?: 1 | 2 | 3 | null;
  accountStatus?: string | null;
  email?: string | null;
  fullName?: string | null;
}

interface AppBootstrapState {
  loading: boolean;
  isReady: boolean;
  authResolved: boolean;
  stage:
    | "detecting_host"
    | "resolving_tenant"
    | "tenant_resolved"
    | "tenant_not_found"
    | "bootstrapping_auth"
    | "bootstrapping_profile"
    | "ready"
    | "bootstrap_error";
  error: string | null;
  authUserId: string | null;
  authEmail: string | null;
  role: UserRole | null;
  profile: AppBootstrapProfile | null;
  scopeType: "platform" | "municipality" | "external";
  municipalityBundle: MunicipalityBundle | null;
  resolution: ReturnType<typeof resolveTenantFromLocation>;
  refreshMunicipalityBundle: (municipalityId?: string | null) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string; role?: string; municipalityId?: string | null }>;
  resetPassword: (email: string) => Promise<{ ok: boolean; message?: string }>;
  updateEmail: (email: string) => Promise<{ ok: boolean; message?: string }>;
  updatePassword: (password: string, currentPassword?: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
}

const AppBootstrapContext = createContext<AppBootstrapState | null>(null);

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function hasNeonBrowserSessionMarker() {
  if (!isNeonBackend || typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => part.startsWith(`${NEON_BROWSER_SESSION_COOKIE}=`));
}

function setNeonBrowserSessionMarker() {
  if (!isNeonBackend || typeof document === "undefined") return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  // Cookie de sessão: sobrevive ao fechamento/reabertura de abas no mesmo
  // navegador, mas não recebe Expires/Max-Age persistente.
  document.cookie = `${NEON_BROWSER_SESSION_COOKIE}=1; Path=/; SameSite=Lax${secure}`;
}

function clearNeonBrowserSessionMarker() {
  if (!isNeonBackend || typeof document === "undefined") return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${NEON_BROWSER_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function hasLegacyNeonTabSnapshot() {
  if (!isNeonBackend || typeof window === "undefined") return false;
  return Boolean(window.sessionStorage.getItem(BOOTSTRAP_SESSION_CACHE_KEY));
}

function shouldRequireFreshNeonLogin() {
  if (!isNeonBackend || typeof window === "undefined") return false;
  if (hasNeonBrowserSessionMarker() || hasLegacyNeonTabSnapshot()) return false;

  return Boolean(
    window.localStorage.getItem(NEON_BROWSER_BOOTSTRAP_CACHE_KEY) ||
    window.localStorage.getItem(PLATFORM_SESSION_CACHE_KEY),
  );
}

async function markCurrentProfileAccess() {
  if (!backendClient) return;

  try {
    const { error } = await backendClient.rpc("mark_current_profile_access");
    if (error) {
      console.warn("[Bootstrap][Access] Não foi possível registrar o último acesso.", error);
    }
  } catch (accessError) {
    console.warn("[Bootstrap][Access] Falha transitória ao registrar o último acesso.", accessError);
  }
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
    admin_prefeitura: "prefeitura_admin",
    prefeitura_supervisor: "prefeitura_supervisor",
    secretario: "prefeitura_supervisor",
    diretor: "prefeitura_supervisor",
    analista: "analista",
    analyst: "analista",
    financeiro: "financeiro",
    financial: "financeiro",
    setor_intersetorial: "setor_intersetorial",
    fiscal: "fiscal",
    profissional_externo: "profissional_externo",
    professional_external: "profissional_externo",
    professional: "profissional_externo",
    profissional: "profissional_externo",
    proprietario_consulta: "proprietario_consulta",
    property_owner: "property_owner",
  };
  return aliases[c] ?? aliases[c.toLowerCase()] ?? null;
}

type BootstrapSnapshot = {
  hostname: string;
  mode: ReturnType<typeof resolveTenantFromLocation>["mode"];
  subdomain: string | null;
  scopeType: "platform" | "municipality" | "external";
  authUserId: string | null;
  authEmail: string | null;
  role: UserRole | null;
  profile: AppBootstrapProfile | null;
  municipalityBundle: MunicipalityBundle | null;
  cachedAt: number;
};

type StoredSupabaseUser = {
  id?: string | null;
  email?: string | null;
  app_metadata?: {
    role?: string | null;
  } | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
  } | null;
};

type StoredPlatformSession = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  email?: string | null;
  municipalityId?: string | null;
  tenantId?: string | null;
};

function readBootstrapSnapshot(
  resolution: ReturnType<typeof resolveTenantFromLocation>,
): BootstrapSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    let raw: string | null = null;

    if (isNeonBackend) {
      const legacyTabSnapshot = window.sessionStorage.getItem(BOOTSTRAP_SESSION_CACHE_KEY);

      if (!hasNeonBrowserSessionMarker() && legacyTabSnapshot) {
        // Migração transparente da sessão ativa anterior: um F5/hot reload não
        // pode expulsar quem já estava autenticado quando esta melhoria entrou.
        setNeonBrowserSessionMarker();
        window.localStorage.setItem(NEON_BROWSER_BOOTSTRAP_CACHE_KEY, legacyTabSnapshot);
        raw = legacyTabSnapshot;
      } else if (hasNeonBrowserSessionMarker()) {
        raw =
          window.localStorage.getItem(NEON_BROWSER_BOOTSTRAP_CACHE_KEY) ||
          legacyTabSnapshot;
      }
    } else {
      raw = window.localStorage.getItem(BOOTSTRAP_CACHE_KEY);
    }

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<BootstrapSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.hostname !== resolution.hostname) return null;
    if (parsed.mode !== resolution.mode) return null;
    if ((parsed.subdomain ?? null) !== (resolution.subdomain ?? null)) return null;
    if (
      typeof parsed.cachedAt !== "number" ||
      (!isNeonBackend && Date.now() - parsed.cachedAt > 1000 * 60 * 60 * 8)
    ) {
      return null;
    }
    // No Neon, o snapshot da sessão serve apenas como warm render para o F5.
    // A identidade continua sendo revalidada em segundo plano antes de qualquer
    // nova leitura/escrita protegida depender do backend.
    if (!isNeonBackend && parsed.authUserId && readStoredSupabaseUser()?.id !== parsed.authUserId) return null;

    return {
      hostname: parsed.hostname ?? resolution.hostname,
      mode: (parsed.mode ?? resolution.mode) as BootstrapSnapshot["mode"],
      subdomain: parsed.subdomain ?? null,
      scopeType: (parsed.scopeType ?? "municipality") as BootstrapSnapshot["scopeType"],
      authUserId: parsed.authUserId ?? null,
      authEmail: parsed.authEmail ?? null,
      role: (parsed.role ?? null) as UserRole | null,
      profile: parsed.profile ?? null,
      municipalityBundle: parsed.municipalityBundle ?? null,
      cachedAt: parsed.cachedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

function readPlatformSessionSnapshot(): StoredPlatformSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PLATFORM_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPlatformSession;
    if (!parsed?.id || parsed.id === "unknown") return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPlatformSessionSnapshot() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(PLATFORM_SESSION_CACHE_KEY);
  } catch {
    // noop
  }
}

function readStoredSupabaseUser(): StoredSupabaseUser | null {
  if (isNeonBackend || typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("sigapro-supabase-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      user?: StoredSupabaseUser | null;
      currentSession?: { user?: StoredSupabaseUser | null } | null;
      session?: { user?: StoredSupabaseUser | null } | null;
      data?: { session?: { user?: StoredSupabaseUser | null } | null } | null;
    };
    return parsed?.user ?? parsed?.currentSession?.user ?? parsed?.session?.user ?? parsed?.data?.session?.user ?? null;
  } catch {
    return null;
  }
}

function resolveAuthenticatedRole(
  profile: AppBootstrapProfile | null,
  authUser: Pick<AuthUserLike, "app_metadata">,
): UserRole | null {
  const profileRole = mapDbRoleCodeToAppRole(profile?.role);
  if (profileRole) return profileRole;

  // Neon é a fonte canônica: metadata do provedor não concede papel de negócio.
  if (isNeonBackend) return null;

  // Compatibilidade exclusiva do rollback Supabase legado.
  return mapDbRoleCodeToAppRole(authUser.app_metadata?.role as string | undefined);
}

function resolveScopeType(role: UserRole | null): "platform" | "municipality" | "external" {
  if (role === "master_admin" || role === "master_ops") return "platform";
  if (role === "profissional_externo" || role === "proprietario_consulta" || role === "property_owner") {
    return "external";
  }
  return "municipality";
}

function readWarmBootstrapSnapshot(
  resolution: ReturnType<typeof resolveTenantFromLocation>,
): BootstrapSnapshot | null {
  if (isNeonBackend && !hasNeonBrowserSessionMarker()) {
    return null;
  }

  const storedUser = readStoredSupabaseUser();
  const storedSession = readPlatformSessionSnapshot();

  // Neon não expõe a sessão pelo storage legado do Supabase. O cache visual
  // da sessão de plataforma é a fonte de warm-render para o F5; ele é apagado
  // no logout explícito, portanto não atravessa troca de conta.
  const userId = isNeonBackend
    ? storedSession?.id ?? null
    : storedUser?.id ?? null;

  if (!userId) return null;
  const matchingStoredSession = storedSession?.id === userId ? storedSession : null;

  const role =
    mapDbRoleCodeToAppRole(
      isNeonBackend ? matchingStoredSession?.role : storedUser?.app_metadata?.role,
    ) ??
    mapDbRoleCodeToAppRole(matchingStoredSession?.role) ??
    null;
  const email = normalizeEmail(
    isNeonBackend
      ? matchingStoredSession?.email ?? null
      : storedUser?.email ?? matchingStoredSession?.email ?? null,
  );
  const municipalityId = matchingStoredSession?.municipalityId ?? matchingStoredSession?.tenantId ?? null;
  const fullName =
    (isNeonBackend
      ? matchingStoredSession?.name
      : storedUser?.user_metadata?.full_name || storedUser?.user_metadata?.name) ||
    matchingStoredSession?.name ||
    null;

  return {
    hostname: resolution.hostname,
    mode: resolution.mode,
    subdomain: resolution.subdomain ?? null,
    scopeType: resolveScopeType(role),
    authUserId: userId,
    authEmail: email,
    role,
    profile: {
      userId,
      role,
      municipalityId,
      email,
      fullName,
    },
    municipalityBundle: null,
    cachedAt: Date.now(),
  };
}

function writeBootstrapSnapshot(snapshot: BootstrapSnapshot | null) {
  if (typeof window === "undefined") return;

  try {
    if (!snapshot) {
      window.localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
      window.localStorage.removeItem(NEON_BROWSER_BOOTSTRAP_CACHE_KEY);
      window.sessionStorage.removeItem(BOOTSTRAP_SESSION_CACHE_KEY);
      clearNeonBrowserSessionMarker();
      return;
    }

    if (isNeonBackend) {
      const serialized = JSON.stringify(snapshot);
      setNeonBrowserSessionMarker();
      // O snapshot não contém token/senha. Ele existe apenas para manter a
      // continuidade visual entre abas enquanto a sessão real do Neon é revalidada.
      window.localStorage.setItem(NEON_BROWSER_BOOTSTRAP_CACHE_KEY, serialized);
      window.sessionStorage.setItem(BOOTSTRAP_SESSION_CACHE_KEY, serialized);
      return;
    }

    window.localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // noop
  }
}

async function loadProfileByUserId(userId: string): Promise<AppBootstrapProfile | null> {
  if (!backendClient) return null;

  if (isNeonBackend) {
    const retryDelays = [0, 80, 180, 350];
    let lastProfileError: unknown = null;

    for (const delayMs of retryDelays) {
      if (delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }

      const contextResult = await backendClient.rpc("get_current_profile_context");
      if (contextResult.error) {
        lastProfileError = contextResult.error;
        continue;
      }

      const ctx = contextResult.data as Record<string, unknown> | null;
      const profileId = String(ctx?.profile_id || "").trim();
      if (!profileId) continue;

      return {
        userId: profileId,
        role: String(ctx?.role || ctx?.profile_role || "").trim() || null,
        municipalityId: String(ctx?.municipality_id || ctx?.tenant_id || "").trim() || null,
        accessLevel:
          Number(ctx?.access_level) === 3
            ? 3
            : Number(ctx?.access_level) === 2
              ? 2
              : Number(ctx?.access_level) === 1
                ? 1
                : null,
        accountStatus: String(ctx?.account_status || "").trim() || null,
        email: String(ctx?.email || ctx?.profile_email || "").trim() || null,
        fullName: String(ctx?.full_name || "").trim() || null,
      };
    }

    console.warn("[Bootstrap][Profile] Neon Auth sem profile ativo após tentativas de resolução", {
      userId,
      error: lastProfileError,
    });
    return null;
  }

  const profileResult = await backendClient
    .from("profiles")
    .select("user_id, role, municipality_id, email, full_name, account_status")
    .eq("user_id", userId)
    .limit(2);

  if (profileResult.error) {
    console.warn("[Bootstrap][Profile] Falha ao carregar profile", { error: profileResult.error });
    return null;
  }
  if (profileResult.data && profileResult.data.length > 1) {
    console.error("[Bootstrap][Profile] Multiplos profiles para o mesmo user_id", { userId });
  }

  const record = profileResult.data?.[0] ?? null;

  const membershipResult = await backendClient
    .from("tenant_memberships")
    .select("tenant_id, role_id, level_name, is_active, deleted_at")
    .is("deleted_at", null)
    .eq("is_active", true)
    .eq("user_id", userId);

  if (membershipResult.error) {
    console.warn("[Bootstrap][Membership] Falha ao carregar memberships", {
      userId,
      error: membershipResult.error,
    });
  }

  const memberships = (membershipResult.data ?? []).filter((item: any) => item.role_id);
  const roleIds = Array.from(new Set(memberships.map((item: any) => item.role_id).filter(Boolean)));
  let roleCodeFromMembership: string | null = null;
  let municipalityIdFromMembership: string | null = null;
  let accessLevelFromMembership: 1 | 2 | 3 | null = null;

  if (roleIds.length > 0) {
    const rolesResult = await backendClient.from("roles").select("id, code").in("id", roleIds);
    if (!rolesResult.error) {
      const rolesById = new Map((rolesResult.data ?? []).map((item: any) => [item.id, item.code]));
      const rankedMembership = memberships
        .map((item: any) => ({
          tenantId: item.tenant_id as string | null,
          roleCode: rolesById.get(item.role_id) ?? null,
          levelName: item.level_name as string | null,
        }))
        .sort((left: any, right: any) => {
          const rank = (roleCode: string | null) => {
            const mapped = mapDbRoleCodeToAppRole(roleCode);
            if (mapped === "master_admin" || mapped === "master_ops" || mapped === "prefeitura_admin") return 4;
            if (mapped === "prefeitura_supervisor") return 3;
            if (mapped === "analista" || mapped === "financeiro" || mapped === "setor_intersetorial" || mapped === "fiscal") return 2;
            if (mapped === "profissional_externo" || mapped === "proprietario_consulta" || mapped === "property_owner") return 1;
            return 0;
          };
          return rank(right.roleCode) - rank(left.roleCode);
        })[0];

      roleCodeFromMembership = rankedMembership?.roleCode ?? null;
      municipalityIdFromMembership = rankedMembership?.tenantId ?? null;
      const storedLevel = Number(rankedMembership?.levelName?.match(/\b[123]\b/)?.[0]);
      accessLevelFromMembership = storedLevel === 1 || storedLevel === 2 || storedLevel === 3 ? storedLevel : null;
    }
  }

  if (!record && !roleCodeFromMembership && !municipalityIdFromMembership) {
    console.warn("[Bootstrap][Profile] Nenhum profile encontrado", { userId });
    return null;
  }

  return {
    userId,
    role: record?.role ?? roleCodeFromMembership,
    municipalityId: record?.municipality_id ?? municipalityIdFromMembership ?? null,
    accessLevel: accessLevelFromMembership,
    accountStatus: record?.account_status ?? null,
    email: record?.email ?? null,
    fullName: record?.full_name ?? null,
  };
}

async function completePendingSignup(
  authUser: AuthUserLike & { id: string },
  currentProfile: AppBootstrapProfile | null,
  resolution: ReturnType<typeof resolveTenantFromLocation>,
) {
  const pending = readPendingSignup(
    authUser,
    currentProfile?.role ?? mapDbRoleCodeToAppRole(authUser.app_metadata?.role as string | undefined),
    currentProfile?.municipalityId ?? null,
  );
  if (!pending) return currentProfile;

  if (resolution.mode === "tenant") {
    const hostBundle = await loadCurrentMunicipalityBundle({
      hostname: resolution.hostname,
      subdomain: resolution.subdomain,
      isLocalhost: resolution.isLocalhost,
    });
    if (!hostBundle?.municipality?.id || hostBundle.municipality.id !== pending.tenantId) {
      throw new Error("Este cadastro foi criado para outra Prefeitura. Acesse o subdomínio correto.");
    }
  }

  if (pending.role === "property_owner") {
    await registerRemoteOwnerAccount({
      tenantId: pending.tenantId,
      fullName: pending.fullName,
      email: pending.email,
      cpfCnpj: pending.cpfCnpj,
      phone: pending.phone,
      title: pending.title,
      bio: pending.bio,
    });
  } else {
    await registerRemoteExternalAccount({
      tenantId: pending.tenantId,
      fullName: pending.fullName,
      email: pending.email,
      cpfCnpj: pending.cpfCnpj,
      phone: pending.phone,
      professionalType: pending.professionalType,
      registrationNumber: pending.registrationNumber,
      companyName: pending.companyName,
      title: pending.title,
      bio: pending.bio,
    });
  }

  await saveRemoteProfile({
    userId: currentProfile?.userId || authUser.id,
    fullName: pending.fullName,
    email: pending.email,
    phone: pending.phone,
    cpfCnpj: pending.cpfCnpj,
    rg: pending.rg,
    birthDate: pending.birthDate,
    professionalType: pending.professionalType,
    registrationNumber: pending.registrationNumber,
    companyName: pending.companyName,
    addressLine: pending.addressLine,
    addressNumber: pending.addressNumber,
    addressComplement: pending.addressComplement,
    neighborhood: pending.neighborhood,
    city: pending.city,
    state: pending.state,
    zipCode: pending.zipCode,
    avatarUrl: "",
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    useAvatarInHeader: false,
    bio: pending.bio,
  });

  const linkedProfile = await loadProfileByUserId(authUser.id);
  if (!linkedProfile?.municipalityId) {
    throw new Error("O cadastro foi confirmado, mas o vínculo com a Prefeitura não pôde ser verificado.");
  }

  clearPendingSignup(authUser.email);
  return linkedProfile;
}

export function AppBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [resolution] = useState(() => resolveTenantFromLocation());
  const requireFreshLoginAfterBrowserRestartRef = useRef(
    shouldRequireFreshNeonLogin(),
  );
  const cachedSnapshotRef = useRef<BootstrapSnapshot | null>(
    requireFreshLoginAfterBrowserRestartRef.current
      ? null
      : readBootstrapSnapshot(resolution) ?? readWarmBootstrapSnapshot(resolution),
  );
  const cachedSnapshot = cachedSnapshotRef.current;
  const [loading, setLoading] = useState(!cachedSnapshot);
  const [isReady, setIsReady] = useState(Boolean(cachedSnapshot));
  const [authResolved, setAuthResolved] = useState(Boolean(cachedSnapshot?.authUserId));
  const [stage, setStage] = useState<AppBootstrapState["stage"]>(cachedSnapshot ? "ready" : "detecting_host");
  const [error, setError] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(cachedSnapshot?.authUserId ?? null);
  const [authEmail, setAuthEmail] = useState<string | null>(cachedSnapshot?.authEmail ?? null);
  const [role, setRole] = useState<UserRole | null>(cachedSnapshot?.role ?? null);
  const [profile, setProfile] = useState<AppBootstrapProfile | null>(cachedSnapshot?.profile ?? null);
  const [scopeType, setScopeType] = useState<"platform" | "municipality" | "external">(
    cachedSnapshot?.scopeType ?? "municipality",
  );
  const [municipalityBundle, setMunicipalityBundle] = useState<MunicipalityBundle | null>(
    cachedSnapshot?.municipalityBundle ?? null,
  );
  const [authChange, setAuthChange] = useState<{ event: string; user: BootstrapAuthUser | null } | null>(null);
  const runBootstrapRef = useRef<((event?: string | null, user?: BootstrapAuthUser | null) => Promise<void>) | null>(null);
  const manualSignInRef = useRef(false);
  const bootstrapEpochRef = useRef(0);
  const runningRef = useRef(false);
  const pendingBootstrapRef = useRef<{ event?: string | null; sessionUserOverride?: BootstrapAuthUser | null } | null>(null);
  const initializedRef = useRef(Boolean(cachedSnapshot));
  const lastAuthUserIdRef = useRef<string | null>(cachedSnapshot?.authUserId ?? null);
  const refreshRef = useRef(false);
  const lastStableRef = useRef({
    authUserId: cachedSnapshot?.authUserId ?? null,
    authEmail: cachedSnapshot?.authEmail ?? null,
    role: cachedSnapshot?.role ?? null,
    profile: cachedSnapshot?.profile ?? null,
    municipalityBundle: cachedSnapshot?.municipalityBundle ?? null,
  });
  const authEventRef = useRef<string | null>(null);
  const explicitSignOutRef = useRef(false);
  const needsInitialRevalidationRef = useRef(Boolean(isNeonBackend && cachedSnapshot?.authUserId));

  useEffect(() => {
    if (!isReady || stage !== "ready") return;

    const hasStableContext = isNeonBackend
      ? Boolean(authUserId)
      : Boolean(authUserId) || Boolean(municipalityBundle?.municipality?.id) || scopeType === "platform";

    if (!hasStableContext) {
      // No Neon, este cache representa uma sessão autenticada. A tela pública da
      // plataforma/Prefeitura não pode recriar o snapshot logo após um logout ou
      // reinício do navegador, senão a próxima abertura parece autenticada.
      writeBootstrapSnapshot(null);
      return;
    }

    writeBootstrapSnapshot({
      hostname: resolution.hostname,
      mode: resolution.mode,
      subdomain: resolution.subdomain ?? null,
      scopeType,
      authUserId,
      authEmail,
      role,
      profile,
      municipalityBundle,
      cachedAt: Date.now(),
    });
  }, [
    authEmail,
    authUserId,
    isReady,
    municipalityBundle,
    profile,
    resolution.hostname,
    resolution.mode,
    resolution.subdomain,
    role,
    scopeType,
    stage,
  ]);

  useEffect(() => {
    if (!hasBackendEnv || !backendClient) {
      setLoading(false);
      setIsReady(true);
      setAuthResolved(true);
      return;
    }

    let active = true;

    const runBootstrap = async (event?: string | null, sessionUserOverride?: BootstrapAuthUser | null) => {
      if (manualSignInRef.current || explicitSignOutRef.current) return;
      if (runningRef.current) {
        pendingBootstrapRef.current = { event, sessionUserOverride };
        return;
      }
      const epoch = bootstrapEpochRef.current;
      const canApply = () => active && epoch === bootstrapEpochRef.current && !manualSignInRef.current;
      runningRef.current = true;
      if (!initializedRef.current) {
        setLoading(true);
      }
      setError(null);
      setStage("detecting_host");

      try {
        setStage("bootstrapping_auth");
        const sessionUser =
          sessionUserOverride !== undefined
            ? sessionUserOverride
            : (await backendClient.auth.getSession()).data.session?.user ?? null;
        const userResult =
          sessionUser || event === "SIGNED_OUT"
            ? null
            : await backendClient.auth.getUser();
        let authUser = sessionUser ?? userResult?.data.user ?? null;
        if (!canApply()) return;

        // O SupabaseAuthAdapter do Neon pode emitir SIGNED_OUT enquanto restaura
        // ou renova a sessão. Esse evento automático NÃO é uma ordem de logout.
        // Se já existe uma identidade estável, mantemos a UI e o snapshot intactos.
        // Somente o signOut explícito do usuário pode desmontar imediatamente a sessão.
        if (
          event === "SIGNED_OUT" &&
          !explicitSignOutRef.current &&
          Boolean(lastStableRef.current.authUserId)
        ) {
          console.warn("[Bootstrap] SIGNED_OUT automático do Neon ignorado para a UI estável", {
            expectedUserId: lastStableRef.current.authUserId,
          });
          setAuthUserId(lastStableRef.current.authUserId);
          setAuthEmail(lastStableRef.current.authEmail);
          setRole(lastStableRef.current.role);
          setProfile(lastStableRef.current.profile);
          setMunicipalityBundle(lastStableRef.current.municipalityBundle);
          setScopeType(resolveScopeType(lastStableRef.current.role));
          setIsReady(true);
          setAuthResolved(true);
          setStage("ready");
          setLoading(false);
          return;
        }

        const isSameStableSessionEvent =
          initializedRef.current &&
          !needsInitialRevalidationRef.current &&
          Boolean(authUser?.id) &&
          lastAuthUserIdRef.current === authUser?.id &&
          (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "INITIAL_SESSION");

        // Neon/Supabase podem repetir eventos da MESMA sessão. Não refazer perfil/prefeitura
        // nem alterar o estado visual quando a identidade já está estável.
        if (isSameStableSessionEvent) {
          setIsReady(true);
          setAuthResolved(true);
          setStage("ready");
          setLoading(false);
          return;
        }

        if (!authUser) {
          const hasStableAuthenticatedState = Boolean(lastStableRef.current.authUserId);
          const shouldPreserveStableState =
            event !== "SIGNED_OUT" && hasStableAuthenticatedState;

          if (shouldPreserveStableState) {
            console.warn("[Bootstrap] Auth transitório sem user, preservando estado", {
              event: event ?? authEventRef.current,
            });
            setAuthUserId(lastStableRef.current.authUserId);
            setAuthEmail(lastStableRef.current.authEmail);
            setRole(lastStableRef.current.role);
            setProfile(lastStableRef.current.profile);
            setMunicipalityBundle(lastStableRef.current.municipalityBundle);
            setScopeType(
              lastStableRef.current.role === "master_admin" || lastStableRef.current.role === "master_ops"
                ? "platform"
                : lastStableRef.current.authUserId
                  ? "municipality"
                  : scopeType,
            );
            setIsReady(true);
            setStage("ready");
            setLoading(false);
            setAuthResolved(true);
            return;
          }
          console.warn("[Bootstrap] Sem usuário autenticado");
          writeBootstrapSnapshot(null);
          clearPlatformSessionSnapshot();
          const devPreferredName =
            (import.meta.env.VITE_DEV_MUNICIPALITY_NAME as string | undefined) || "";
        if (resolution.mode === "tenant") {
          setStage("resolving_tenant");
          const tenantBundle = await loadCurrentMunicipalityBundle({
            hostname: resolution.hostname,
            subdomain: resolution.subdomain,
            isLocalhost: resolution.isLocalhost,
            preferredName: devPreferredName,
          });
          if (!canApply()) return;
          setAuthUserId(null);
          setAuthEmail(null);
          setRole(null);
          setProfile(null);
          setScopeType("municipality");
            setMunicipalityBundle(tenantBundle);
            setIsReady(true);
            setStage(tenantBundle?.municipality ? "ready" : "tenant_not_found");
            setAuthResolved(true);
            initializedRef.current = true;
            return;
          }
          setAuthUserId(null);
          setAuthEmail(null);
          setRole(null);
          setProfile(null);
          setScopeType("platform");
          setMunicipalityBundle(null);
          setIsReady(true);
          setStage("ready");
          setAuthResolved(true);
          initializedRef.current = true;
          return;
        }

        setStage("bootstrapping_profile");
        let nextProfile = await loadProfileByUserId(authUser.id);
        try {
          nextProfile = await completePendingSignup(authUser, nextProfile, resolution);
        } catch (signupError) {
          console.error("[Bootstrap] Falha ao concluir cadastro confirmado", signupError);
          setError(signupError instanceof Error ? signupError.message : "Falha ao vincular cadastro.");
        }
        const mappedRole = resolveAuthenticatedRole(nextProfile, authUser);
        if (!mappedRole) {
          throw new Error(
            "Conta autenticada sem perfil ou papel ativo no banco oficial. Solicite a regularização do acesso.",
          );
        }

        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          void markCurrentProfileAccess();
        }

        const nextScopeType: "platform" | "municipality" | "external" =
          mappedRole === "master_admin" || mappedRole === "master_ops"
            ? "platform"
            : mappedRole === "profissional_externo" || mappedRole === "proprietario_consulta" || mappedRole === "property_owner"
              ? "external"
              : "municipality";

        let nextBundle: MunicipalityBundle | null = null;
        if (nextScopeType !== "platform") {
          setStage("resolving_tenant");
          if (resolution.mode === "tenant") {
            nextBundle = await loadCurrentMunicipalityBundle({
              hostname: resolution.hostname,
              subdomain: resolution.subdomain,
              isLocalhost: resolution.isLocalhost,
            });
          } else if (nextProfile?.municipalityId) {
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

        if (!canApply()) return;
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
        setStage("ready");
        setAuthResolved(true);
        initializedRef.current = true;
        needsInitialRevalidationRef.current = false;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Falha no bootstrap";
        console.error("[Bootstrap] Erro", { message });
        if (!canApply()) return;
        setError(message);
        if (lastStableRef.current.authUserId || lastStableRef.current.municipalityBundle?.municipality?.id) {
          console.warn("[Bootstrap] Mantendo estado estável após erro");
          setAuthUserId(lastStableRef.current.authUserId);
          setAuthEmail(lastStableRef.current.authEmail);
          setRole(lastStableRef.current.role);
          setProfile(lastStableRef.current.profile);
          setMunicipalityBundle(lastStableRef.current.municipalityBundle);
          setScopeType(resolveScopeType(lastStableRef.current.role));
          setIsReady(true);
          setStage("ready");
          setAuthResolved(true);
        } else {
          setIsReady(true);
          setStage("bootstrap_error");
          setAuthResolved(true);
        }
      } finally {
        if (canApply()) setLoading(false);
        runningRef.current = false;
        const pendingBootstrap = pendingBootstrapRef.current;
        pendingBootstrapRef.current = null;
        if (active && !manualSignInRef.current && pendingBootstrap) {
          void runBootstrap(pendingBootstrap.event, pendingBootstrap.sessionUserOverride);
        }
      }
    };

    runBootstrapRef.current = runBootstrap;
    const { data } = backendClient.auth.onAuthStateChange((event, session) => {
      authEventRef.current = event;
      if (manualSignInRef.current || explicitSignOutRef.current) return;
      // Supabase awaits this callback under its auth lock; data loading belongs in the effect below.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        setAuthChange({ event, user: session?.user ?? null });
      }
    });

    if (requireFreshLoginAfterBrowserRestartRef.current) {
      // Havia uma sessão autenticada persistida, mas o marcador da sessão do
      // navegador desapareceu. Tratamos isso como uma nova sessão do navegador
      // (ex.: reinicialização) e exigimos login sem depender de eventos do adapter.
      explicitSignOutRef.current = true;
      writeBootstrapSnapshot(null);
      clearPlatformSessionSnapshot();
      lastAuthUserIdRef.current = null;
      initializedRef.current = false;
      needsInitialRevalidationRef.current = false;
      lastStableRef.current = {
        authUserId: null,
        authEmail: null,
        role: null,
        profile: null,
        municipalityBundle: null,
      };
      setAuthUserId(null);
      setAuthEmail(null);
      setRole(null);
      setProfile(null);
      setMunicipalityBundle(null);
      setAuthResolved(false);

      void (async () => {
        try {
          await backendClient.auth.signOut();
        } catch (restartSignOutError) {
          console.warn(
            "[Bootstrap] Não foi possível revogar a sessão anterior ao iniciar nova sessão do navegador",
            restartSignOutError,
          );
        } finally {
          if (!active) return;
          explicitSignOutRef.current = false;
          requireFreshLoginAfterBrowserRestartRef.current = false;
          void runBootstrap("SIGNED_OUT", null);
        }
      })();
    }

    return () => {
      active = false;
      runBootstrapRef.current = null;
      data.subscription.unsubscribe();
    };
  }, [resolution.hostname, resolution.isLocalhost, resolution.subdomain]);

  useEffect(() => {
    if (authChange) void runBootstrapRef.current?.(authChange.event, authChange.user);
  }, [authChange]);

  const value = useMemo<AppBootstrapState>(
    () => ({
      loading,
      isReady,
      authResolved,
      stage,
      error,
      authUserId,
      authEmail,
      role,
      profile,
      scopeType,
      municipalityBundle,
      resolution,
      refreshMunicipalityBundle: async (municipalityId?: string | null) => {
        if (!hasBackendEnv || !backendClient) return;
        if (refreshRef.current) return;
        refreshRef.current = true;
        try {
          if (scopeType === "platform") {
            setMunicipalityBundle(null);
            return;
          }
          const next =
            resolution.mode !== "tenant" && municipalityId && municipalityId.trim()
              ? await loadMunicipalityBundleById(municipalityId)
              : await loadCurrentMunicipalityBundle({
                  hostname: resolution.hostname,
                  subdomain: resolution.subdomain,
                  isLocalhost: resolution.isLocalhost,
                  preferredName:
                    (import.meta.env.VITE_DEV_MUNICIPALITY_NAME as string | undefined) ||
                    "",
                });
          setMunicipalityBundle(next);
        } finally {
          refreshRef.current = false;
        }
      },
      signIn: async (email, password) => {
        if (!hasBackendEnv || !backendClient) {
          return { ok: false, message: "Serviço de autenticação indisponível." };
        }
        const normalized = normalizeEmail(email);
        const clearIdentity = () => {
          writeBootstrapSnapshot(null);
          clearPlatformSessionSnapshot();
          lastAuthUserIdRef.current = null;
          initializedRef.current = false;
          needsInitialRevalidationRef.current = false;
          lastStableRef.current = {
            authUserId: null, authEmail: null, role: null, profile: null, municipalityBundle: null,
          };
          setAuthUserId(null);
          setAuthEmail(null);
          setRole(null);
          setProfile(null);
          setMunicipalityBundle(null);
          setAuthResolved(false);
        };
        manualSignInRef.current = true;
        bootstrapEpochRef.current += 1;
        setAuthChange(null);
        pendingBootstrapRef.current = null;
        setLoading(true);
        setError(null);
        setStage("bootstrapping_auth");
        try {
          clearIdentity();

          let signInResult = await backendClient.auth.signInWithPassword({
            email: normalized,
            password,
          });

          if (
            signInResult.error &&
            /session|refresh|token|jwt/i.test(signInResult.error.message || "")
          ) {
            try {
              if (isNeonBackend) {
                await backendClient.auth.signOut();
              } else {
                await backendClient.auth.signOut({ scope: "local" });
              }
            } catch {
              // A autenticação seguinte continua sendo a fonte de verdade.
            }
            signInResult = await backendClient.auth.signInWithPassword({
              email: normalized,
              password,
            });
          }

          const { data, error: signInError } = signInResult;
          if (signInError || !data.user) {
            const rawMessage = signInError?.message || "Falha ao autenticar.";
            const translatedMessage = /invalid email or password/i.test(rawMessage)
              ? "E-mail ou senha incorretos."
              : rawMessage;
            return { ok: false, message: translatedMessage };
          }

          let nextProfile = await loadProfileByUserId(data.user.id);
          nextProfile = await completePendingSignup(data.user, nextProfile, resolution);
          if (nextProfile?.accountStatus === "blocked" || nextProfile?.accountStatus === "inactive") {
            throw new Error("Esta conta foi bloqueada ou desativada por um administrador.");
          }
          const mappedRole = resolveAuthenticatedRole(nextProfile, data.user);
          if (!mappedRole) {
            throw new Error(
              "Conta autenticada sem perfil ou papel ativo no banco oficial. Solicite a regularização do acesso.",
            );
          }

          void markCurrentProfileAccess();
          const nextScopeType: "platform" | "municipality" | "external" =
            mappedRole === "master_admin" || mappedRole === "master_ops"
              ? "platform"
              : mappedRole === "profissional_externo" || mappedRole === "proprietario_consulta" || mappedRole === "property_owner"
                ? "external"
                : "municipality";

          const resolvedEmail = normalizeEmail(data.user.email);
          let nextBundle: MunicipalityBundle | null = null;

          if (nextScopeType !== "platform") {
            if (resolution.mode === "tenant") {
              nextBundle = await loadCurrentMunicipalityBundle({
                hostname: resolution.hostname,
                subdomain: resolution.subdomain,
                isLocalhost: resolution.isLocalhost,
              });
              if (!nextBundle?.municipality?.id) {
                throw new Error("Prefeitura deste subdomínio não encontrada.");
              }
              if (!nextProfile?.municipalityId || nextProfile.municipalityId !== nextBundle.municipality.id) {
                throw new Error("Esta conta não está vinculada à Prefeitura deste subdomínio.");
              }
            } else if (nextProfile?.municipalityId) {
              nextBundle = await loadMunicipalityBundleById(nextProfile.municipalityId);
            }
          }

          setAuthUserId(data.user.id);
          setAuthEmail(resolvedEmail);
          setRole(mappedRole);
          setProfile(nextProfile);
          setScopeType(nextScopeType);
          setMunicipalityBundle(nextBundle);
          initializedRef.current = true;
          lastAuthUserIdRef.current = data.user.id;
          lastStableRef.current = {
            authUserId: data.user.id,
            authEmail: resolvedEmail,
            role: mappedRole,
            profile: nextProfile,
            municipalityBundle: nextBundle,
          };

          writeBootstrapSnapshot({
            hostname: resolution.hostname,
            mode: resolution.mode,
            subdomain: resolution.subdomain ?? null,
            scopeType: nextScopeType,
            authUserId: data.user.id,
            authEmail: resolvedEmail,
            role: mappedRole,
            profile: nextProfile,
            municipalityBundle: nextBundle,
            cachedAt: Date.now(),
          });

          return { ok: true, role: mappedRole, municipalityId: nextProfile?.municipalityId ?? null };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Falha ao autenticar.";
          try {
            if (isNeonBackend) {
              await backendClient.auth.signOut();
            } else {
              await backendClient.auth.signOut({ scope: "local" });
            }
          } catch (signOutError) {
            console.warn("[Bootstrap] Não foi possível encerrar a sessão local após erro de login", signOutError);
          }
          clearIdentity();
          setError(message);
          return { ok: false, message };
        } finally {
          manualSignInRef.current = false;
          setAuthResolved(true);
          setIsReady(true);
          setStage("ready");
          setLoading(false);
        }
      },
      resetPassword: async (email) => {
        if (!hasBackendEnv || !backendClient) {
          return { ok: false, message: "Serviço de autenticação indisponível." };
        }
        const normalized = normalizeEmail(email);

        if (isNeonBackend) {
          if (!neonAccountClient) {
            return { ok: false, message: "Neon Auth indisponível." };
          }
          const { error: resetError } = await neonAccountClient.requestPasswordReset({
            email: normalized,
            redirectTo: `${window.location.origin}/recuperar-senha`,
          });
          if (resetError) return { ok: false, message: resetError.message || "Falha ao enviar o e-mail." };
          return { ok: true, message: "Se a conta existir, enviaremos as instruções por e-mail." };
        }

        const { error: resetError } = await backendClient.auth.resetPasswordForEmail(normalized, {
          redirectTo: `${window.location.origin}/recuperar-senha`,
        });
        if (resetError) return { ok: false, message: resetError.message };
        return { ok: true, message: "E-mail enviado." };
      },
      updateEmail: async (email) => {
        if (!hasBackendEnv || !backendClient) {
          return { ok: false, message: "Serviço de autenticação indisponível." };
        }
        const normalized = normalizeEmail(email);

        if (isNeonBackend) {
          if (!neonAccountClient) {
            return { ok: false, message: "Neon Auth indisponível." };
          }
          const { error: updateError } = await neonAccountClient.changeEmail({
            newEmail: normalized,
            callbackURL: `${window.location.origin}/configuracoes`,
          });
          if (updateError) return { ok: false, message: updateError.message || "Falha ao solicitar alteração de e-mail." };
          return { ok: true, message: "Confirme a alteração pelo e-mail enviado." };
        }

        const { error: updateError } = await backendClient.auth.updateUser({ email: normalized });
        if (updateError) return { ok: false, message: updateError.message };
        return { ok: true, message: "E-mail atualizado." };
      },
      updatePassword: async (password, currentPassword) => {
        if (!hasBackendEnv || !backendClient) {
          return { ok: false, message: "Serviço de autenticação indisponível." };
        }

        if (isNeonBackend) {
          if (!neonAccountClient) {
            return { ok: false, message: "Neon Auth indisponível." };
          }
          const token =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("token")
              : null;
          if (token) {
            const { error: updateError } = await neonAccountClient.resetPassword({
              newPassword: password,
              token,
            });
            if (updateError) {
              return { ok: false, message: updateError.message || "Falha ao redefinir a senha." };
            }
            return { ok: true, message: "Senha atualizada." };
          }

          if (!currentPassword) {
            return {
              ok: false,
              message: "Informe a senha atual para alterar sua senha.",
            };
          }

          const { error: updateError } = await neonAccountClient.changePassword({
            currentPassword,
            newPassword: password,
            revokeOtherSessions: true,
          });
          if (updateError) {
            return { ok: false, message: updateError.message || "Não foi possível alterar a senha." };
          }
          return { ok: true, message: "Senha atualizada com sucesso." };
        }

        const { error: updateError } = await backendClient.auth.updateUser({ password });
        if (updateError) return { ok: false, message: updateError.message };
        return { ok: true, message: "Senha atualizada." };
      },
      signOut: async () => {
        explicitSignOutRef.current = true;
        authEventRef.current = "SIGNED_OUT";
        bootstrapEpochRef.current += 1;
        pendingBootstrapRef.current = null;
        setAuthChange(null);
        lastAuthUserIdRef.current = null;
        initializedRef.current = false;
        needsInitialRevalidationRef.current = false;
        lastStableRef.current = {
          authUserId: null,
          authEmail: null,
          role: null,
          profile: null,
          municipalityBundle: null,
        };

        // Encerrar a identidade visual primeiro. Nenhuma chamada de rede pode
        // colocar a tela autenticada em um estado intermediário de validação.
        writeBootstrapSnapshot(null);
        clearPlatformSessionSnapshot();
        setAuthUserId(null);
        setAuthEmail(null);
        setRole(null);
        setProfile(null);
        setScopeType("municipality");
        setMunicipalityBundle(null);
        setError(null);
        setIsReady(true);
        setAuthResolved(true);
        setStage("ready");
        setLoading(false);

        try {
          if (hasBackendEnv && backendClient) {
            await Promise.race([
              backendClient.auth.signOut(),
              new Promise<void>((resolve) => {
                setTimeout(() => {
                  console.warn("[Logout] signOut timeout fallback");
                  resolve();
                }, 2500);
              }),
            ]);
          }
        } finally {
          // O estado local já foi concluído antes da rede. Aqui apenas liberamos
          // novos eventos normais de autenticação.
          explicitSignOutRef.current = false;
        }
      },
    }),
    [authEmail, authResolved, authUserId, error, isReady, loading, municipalityBundle, profile, resolution, role, scopeType],
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
