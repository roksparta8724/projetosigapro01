import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import { getRootDomain } from "@/lib/tenant";
import type {
  Municipality,
  MunicipalityBranding,
  MunicipalityBundle,
  MunicipalitySettings,
} from "@/lib/municipality";

// ---------------------------------------------------------------------------
// Helpers de erro
// ---------------------------------------------------------------------------

function isMissingRelationError(error: unknown, relationName: string) {
  if (!error || typeof error !== "object") return false;
  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";
  const details =
    "details" in error && typeof error.details === "string" ? error.details : "";
  const hint =
    "hint" in error && typeof error.hint === "string" ? error.hint : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const blob = `${message} ${details} ${hint}`.toLowerCase();
  return code === "PGRST205" || blob.includes(relationName.toLowerCase());
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function resolveMunicipalityRecordName(record: Record<string, any>) {
  return (
    (typeof record.display_name === "string" && record.display_name.trim()) ||
    (typeof record.official_name === "string" && record.official_name.trim()) ||
    (typeof record.name === "string" && record.name.trim()) ||
    ""
  );
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapMunicipality(record: any): Municipality {
  return {
    id: record.id,
    name: resolveMunicipalityRecordName(record),
    state: record.state ?? "",
    slug: record.slug ?? "",
    subdomain: record.subdomain ?? "",
    customDomain: record.custom_domain ?? "",
    status: record.status ?? "active",
    secretariatName: record.secretariat_name ?? "",
    email: record.email ?? record.contact_email ?? "",
    phone: record.phone ?? record.contact_phone ?? "",
    address: record.address ?? "",
    createdAt: record.created_at ?? "",
    updatedAt: record.updated_at ?? "",
  };
}

function mapMunicipalityBranding(record: any): MunicipalityBranding {
  // Resolve header logo: prefere campo dedicado, cai para logo_url
  const headerLogoUrl = record.header_logo_url ?? record.logo_url ?? "";
  // Resolve footer logo: prefere campo dedicado, cai para logo_url
  const footerLogoUrl = record.footer_logo_url ?? record.logo_url ?? "";

  return {
    id: record.id,
    municipalityId: record.municipality_id,
    logoUrl: record.logo_url ?? "",
    headerLogoUrl,
    footerLogoUrl,
    headerLogoObjectKey:
      record.header_logo_object_key ?? record.logo_object_key ?? "",
    footerLogoObjectKey:
      record.footer_logo_object_key ?? record.logo_object_key ?? "",
    headerLogoFileName: record.header_logo_file_name ?? "",
    footerLogoFileName: record.footer_logo_file_name ?? "",
    headerLogoMimeType: record.header_logo_mime_type ?? record.logo_mime_type ?? "",
    footerLogoMimeType: record.footer_logo_mime_type ?? record.logo_mime_type ?? "",
    logoStorageProvider: record.logo_storage_provider ?? "",
    logoBucket: record.logo_bucket ?? "",
    logoObjectKey: record.logo_object_key ?? "",
    logoFileName: "",
    logoMimeType: "",
    logoFileSize: record.logo_file_size ?? null,
    coatOfArmsUrl: record.coat_of_arms_url ?? "",
    primaryColor: record.primary_color ?? "",
    secondaryColor: record.secondary_color ?? "",
    accentColor: record.accent_color ?? "",
    officialHeaderText: record.official_header_text ?? "",
    officialFooterText: record.official_footer_text ?? "",
    createdAt: record.created_at ?? "",
    updatedAt: record.updated_at ?? "",
  };
}

function mapMunicipalitySettings(record: any): MunicipalitySettings {
  return {
    id: record.id,
    municipalityId: record.municipality_id,
    protocolPrefix: record.protocol_prefix ?? "",
    guidePrefix: record.guide_prefix ?? "",
    timezone: record.timezone ?? "America/Sao_Paulo",
    locale: record.locale ?? "pt-BR",
    requireProfessionalRegistration: Boolean(
      record.require_professional_registration ?? true,
    ),
    allowDigitalProtocol: Boolean(record.allow_digital_protocol ?? true),
    allowWalkinProtocol: Boolean(record.allow_walkin_protocol ?? false),
    generalSettings:
      record.general_settings && typeof record.general_settings === "object"
        ? (record.general_settings as Record<string, unknown>)
        : {},
    createdAt: record.created_at ?? "",
    updatedAt: record.updated_at ?? "",
  };
}

// ---------------------------------------------------------------------------
// Candidatos de subdomínio
// ---------------------------------------------------------------------------

function buildSubdomainCandidates(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return [];
  const rootDomain = getRootDomain();
  const isFullDomain =
    normalized.includes(".") && normalized.endsWith(rootDomain);
  const baseLabel = normalized.split(".")[0] ?? normalized;
  const candidates = new Set<string>();

  candidates.add(normalized);
  candidates.add(baseLabel);
  if (rootDomain && baseLabel && !isFullDomain) {
    candidates.add(`${baseLabel}.${rootDomain}`);
  }

  return Array.from(candidates).filter(Boolean);
}

function buildSubdomainOrFilter(candidate: string) {
  const hasDot = candidate.includes(".");
  const subdomainClause = hasDot
    ? `subdomain.ilike.${candidate}`
    : `subdomain.ilike.%${candidate}%`;
  const customDomainClause = hasDot
    ? `custom_domain.ilike.${candidate}`
    : `custom_domain.ilike.%${candidate}%`;
  return `${subdomainClause},slug.ilike.${candidate},${customDomainClause}`;
}

function normalizeHostLabel(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

function buildHostCandidates(hostname: string) {
  const normalized = normalizeHostLabel(hostname);
  if (!normalized) return [];
  const rootDomain = getRootDomain();
  const candidates = new Set<string>();

  candidates.add(normalized);
  if (rootDomain && normalized.endsWith(`.${rootDomain}`)) {
    const label = normalized.slice(0, normalized.length - rootDomain.length - 1);
    if (label) candidates.add(label);
  } else if (!normalized.includes(".") && rootDomain) {
    candidates.add(`${normalized}.${rootDomain}`);
  }

  return Array.from(candidates).filter(Boolean);
}

async function resolveMunicipalityRecordByHost(params: {
  hostname?: string | null;
  subdomain?: string | null;
}) {
  if (!hasSupabaseEnv || !supabase) return null;

  const normalizedHost = params.hostname ? normalizeHostLabel(params.hostname) : "";
  const candidates = new Set<string>();

  if (params.subdomain) {
    buildSubdomainCandidates(params.subdomain).forEach((item) => candidates.add(item));
  }
  if (normalizedHost) {
    buildHostCandidates(normalizedHost).forEach((item) => candidates.add(item));
  }

  if (candidates.size === 0) return null;

  const list = Array.from(candidates);
  console.log("[TenantQuery] Buscando municipio por host/subdominio", {
    hostname: normalizedHost || params.hostname,
    subdomain: params.subdomain,
    candidates: list,
  });

  // 1) Tentativa exata
  for (const candidate of list) {
    const result = await supabase
      .from("municipalities")
      .select("*")
      .or(`custom_domain.eq.${candidate},subdomain.eq.${candidate},slug.eq.${candidate}`)
      .maybeSingle();

    if (result.error) {
      if (!isMissingRelationError(result.error, "public.municipalities")) throw result.error;
    }

    if (result.data) {
      console.log("[TenantMatch] Municipio encontrado (exato)", { candidate, id: result.data.id });
      return result.data;
    }
  }

  // 2) Tentativa flexível (ilike)
  for (const candidate of list) {
    const result = await supabase
      .from("municipalities")
      .select("*")
      .or(buildSubdomainOrFilter(candidate))
      .maybeSingle();

    if (result.error) {
      if (!isMissingRelationError(result.error, "public.municipalities")) throw result.error;
    }

    if (result.data) {
      console.log("[TenantMatch] Municipio encontrado (ilike)", { candidate, id: result.data.id });
      return result.data;
    }
  }

  console.warn("[TenantNotFound] Municipio nao encontrado para host/subdominio", {
    hostname: normalizedHost || params.hostname,
    subdomain: params.subdomain,
    candidates: list,
  });
  return null;
}

// ---------------------------------------------------------------------------
// Variáveis de ambiente de dev
// ---------------------------------------------------------------------------

function getDevMunicipalityEnv() {
  const id =
    (import.meta.env.VITE_DEV_MUNICIPALITY_ID as string | undefined)?.trim() ||
    "";
  const slug =
    (import.meta.env.VITE_DEV_MUNICIPALITY_SLUG as string | undefined)?.trim() ||
    "";
  const name =
    (import.meta.env.VITE_DEV_MUNICIPALITY_NAME as string | undefined)?.trim() ||
    "";
  return { id, slug, name };
}

// ---------------------------------------------------------------------------
// Busca por nome
// ---------------------------------------------------------------------------

async function fetchMunicipalityByName(name: string) {
  if (!hasSupabaseEnv || !supabase || !name.trim()) return null;
  const result = await supabase
    .from("municipalities")
    .select("*")
    .ilike("name", `%${name.trim()}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    if (isMissingRelationError(result.error, "public.municipalities"))
      return null;
    throw result.error;
  }

  return result.data ?? null;
}

async function fetchDefaultMunicipalityRecord(
  preferredName?: string | null,
) {
  if (!hasSupabaseEnv || !supabase) return null;

  const normalizedPreferred = (preferredName || "").trim();
  if (normalizedPreferred) {
    const byName = await supabase
      .from("municipalities")
      .select("*")
      .ilike("name", `%${normalizedPreferred}%`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byName.error) {
      if (!isMissingRelationError(byName.error, "public.municipalities")) {
        throw byName.error;
      }
    } else if (byName.data) {
      return byName.data;
    }
  }

  // Fallback: primeira prefeitura cadastrada
  const fallback = await supabase
    .from("municipalities")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallback.error) {
    if (isMissingRelationError(fallback.error, "public.municipalities")) {
      return null;
    }
    throw fallback.error;
  }

  return fallback.data ?? null;
}

// ---------------------------------------------------------------------------
// Carregamento do bundle (municipality + branding + settings)
// ---------------------------------------------------------------------------

async function loadBrandingAndSettings(municipalityId: string) {
  if (!supabase) return { branding: null, settings: null };

  const [brandingResult, settingsResult] = await Promise.all([
    supabase
      .from("municipality_branding")
      .select("*")
      .eq("municipality_id", municipalityId)
      .maybeSingle(),
    supabase
      .from("municipality_settings")
      .select("*")
      .eq("municipality_id", municipalityId)
      .maybeSingle(),
  ]);

  const errors = [
    isMissingRelationError(brandingResult.error, "public.municipality_branding")
      ? null
      : brandingResult.error,
    isMissingRelationError(
      settingsResult.error,
      "public.municipality_settings",
    )
      ? null
      : settingsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) throw errors[0];

  return {
    branding: brandingResult.data
      ? mapMunicipalityBranding(brandingResult.data)
      : null,
    settings: settingsResult.data
      ? mapMunicipalitySettings(settingsResult.data)
      : null,
  };
}

// ---------------------------------------------------------------------------
// Exportações públicas
// ---------------------------------------------------------------------------

export async function resolveDefaultMunicipalityId(
  preferredName?: string | null,
): Promise<string | null> {
  if (!hasSupabaseEnv || !supabase) return null;
  const record = await fetchDefaultMunicipalityRecord(preferredName);
  return record?.id ?? null;
}

export async function resolveDevMunicipalityId(): Promise<string | null> {
  const env = getDevMunicipalityEnv();

  // 1. Por ID direto
  if (env.id) {
    console.log("[SIGAPRO][Dev] Tentando municipio por VITE_DEV_MUNICIPALITY_ID", {
      id: env.id,
    });
    if (isUuid(env.id)) {
      console.log("[SIGAPRO][Dev] Municipio resolvido por ID (sem query)", {
        id: env.id,
      });
      return env.id;
    }
  }

  if (!hasSupabaseEnv || !supabase) return null;

  // 2. Por slug/subdomain
  if (env.slug) {
    console.log("[SIGAPRO][Dev] Tentando municipio por VITE_DEV_MUNICIPALITY_SLUG", {
      slug: env.slug,
    });
    const idBySlug = await resolveMunicipalityIdBySubdomain(env.slug);
    if (idBySlug) {
      console.log("[SIGAPRO][Dev] Municipio resolvido por slug", {
        slug: env.slug,
        id: idBySlug,
      });
      return idBySlug;
    }
  }

  // 3. Por nome
  if (env.name) {
    console.log("[SIGAPRO][Dev] Tentando municipio por VITE_DEV_MUNICIPALITY_NAME", {
      name: env.name,
    });
    const byName = await fetchMunicipalityByName(env.name);
    if (byName?.id) {
      console.log("[SIGAPRO][Dev] Municipio resolvido por nome", {
        name: env.name,
        id: byName.id,
      });
      return byName.id;
    }
  }

  // 4. Primeiro cadastrado (fallback final)
  console.log("[SIGAPRO][Dev] Usando fallback: primeiro municipio cadastrado");
  return resolveDefaultMunicipalityId(env.name || null);
}

export async function loadDevMunicipalityBundle(): Promise<MunicipalityBundle | null> {
  console.log("[SIGAPRO][Dev] Carregando bundle de desenvolvimento");
  const env = getDevMunicipalityEnv();
  const id = await resolveDevMunicipalityId();

  if (id) {
    console.log("[SIGAPRO][Dev] Bundle dev por ID resolvido", { id });
    return loadMunicipalityBundleById(id);
  }

  if (env.slug) {
    console.log("[SIGAPRO][Dev] Bundle dev por slug", { slug: env.slug });
    return loadMunicipalityBundleBySubdomain(env.slug);
  }

  if (env.name) {
    const record = await fetchMunicipalityByName(env.name);
    if (record?.id) {
      console.log("[SIGAPRO][Dev] Bundle dev por nome", {
        name: env.name,
        id: record.id,
      });
      return loadMunicipalityBundleById(record.id);
    }
  }

  console.log("[SIGAPRO][Dev] Bundle dev por fallback default");
  return loadDefaultMunicipalityBundle(env.name || null);
}

export async function loadDefaultMunicipalityBundle(
  preferredName?: string | null,
): Promise<MunicipalityBundle | null> {
  if (!hasSupabaseEnv || !supabase) return null;

  const record = await fetchDefaultMunicipalityRecord(preferredName);
  if (!record?.id) return null;

  const municipality = mapMunicipality(record);
  const { branding, settings } = await loadBrandingAndSettings(municipality.id);

  return { municipality, branding, settings };
}

export async function resolveCurrentMunicipalityId(options: {
  hostname?: string | null;
  subdomain?: string | null;
  isLocalhost?: boolean;
  preferredName?: string | null;
}): Promise<{ id: string | null; source: string }> {
  const { hostname, subdomain, isLocalhost, preferredName } = options;

  console.log("[TenantResolver] resolveCurrentMunicipalityId", {
    hostname,
    subdomain,
    isLocalhost,
    preferredName,
    hasSupabaseEnv,
  });

  if (isLocalhost) {
    const devId = await resolveDevMunicipalityId();
    if (devId) {
      console.log("[TenantResolver] Municipio resolvido via dev-env", { devId });
      return { id: devId, source: "dev-env" };
    }
    const fallbackId = await resolveDefaultMunicipalityId(preferredName ?? null);
    console.log("[TenantResolver] Municipio resolvido via dev-fallback", {
      fallbackId,
    });
    return { id: fallbackId, source: "dev-fallback" };
  }

  const record = await resolveMunicipalityRecordByHost({ hostname, subdomain });
  if (record?.id) {
    console.log("[TenantResolver] Municipio resolvido via host/subdomain", {
      hostname,
      subdomain,
      id: record.id,
    });
    return { id: record.id, source: "host" };
  }

  console.warn("[TenantNotFound] Nao foi possivel resolver municipio", options);
  return { id: null, source: "unknown" };
}

export async function loadCurrentMunicipalityBundle(options: {
  hostname?: string | null;
  subdomain?: string | null;
  isLocalhost?: boolean;
  preferredName?: string | null;
}): Promise<MunicipalityBundle | null> {
  const result = await resolveCurrentMunicipalityId(options);
  if (result.id) return loadMunicipalityBundleById(result.id);

  if (options.isLocalhost) return loadDevMunicipalityBundle();

  const record = await resolveMunicipalityRecordByHost({
    hostname: options.hostname,
    subdomain: options.subdomain,
  });

  if (!record?.id) return null;

  const municipality = mapMunicipality(record);
  const { branding, settings } = await loadBrandingAndSettings(municipality.id);
  return { municipality, branding, settings };
}

export async function resolveCurrentMunicipality(options: {
  hostname?: string | null;
  subdomain?: string | null;
  isLocalhost?: boolean;
}): Promise<Municipality | null> {
  const { hostname, subdomain, isLocalhost } = options;
  const env = getDevMunicipalityEnv();
  const normalizedHost = (hostname || "").trim().toLowerCase();

  const isPrivateIp = (host: string) => {
    if (!host) return false;
    if (host.startsWith("10.")) return true;
    if (host.startsWith("192.168.")) return true;
    if (host.startsWith("172.")) {
      const parts = host.split(".");
      const second = Number(parts[1] || "0");
      return second >= 16 && second <= 31;
    }
    return false;
  };

  const isLocalHostname =
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost.endsWith(".local") ||
    isPrivateIp(normalizedHost);

  const effectiveLocalhost = Boolean(isLocalhost || isLocalHostname);

  console.log("[SIGAPRO][Diagnostico] resolveCurrentMunicipality", {
    hostname: normalizedHost || hostname,
    subdomain,
    isLocalhost,
    isLocalHostname,
    effectiveLocalhost,
    devEnv: env,
  });

  if (effectiveLocalhost) {
    if (env.id && isUuid(env.id)) {
      console.log("[SIGAPRO][Diagnostico] Usando municipality do .env (sem consulta)", {
        id: env.id,
        slug: env.slug,
        name: env.name,
      });
      return {
        id: env.id,
        name: env.name || "Prefeitura",
        state: "",
        slug: env.slug || "",
        subdomain: env.slug || "",
        customDomain: "",
        status: "active",
        secretariatName: "",
        email: "",
        phone: "",
        address: "",
        createdAt: "",
        updatedAt: "",
      };
    }
  }

  if (!hasSupabaseEnv || !supabase) return null;

  if (effectiveLocalhost) {
    if (env.id && isUuid(env.id)) {
      const byId = await supabase.from("municipalities").select("*").eq("id", env.id).maybeSingle();
      if (byId.data) return mapMunicipality(byId.data);
    }
    if (env.slug) {
      const idBySlug = await resolveMunicipalityIdBySubdomain(env.slug);
      if (idBySlug) {
        const byId = await supabase.from("municipalities").select("*").eq("id", idBySlug).maybeSingle();
        if (byId.data) return mapMunicipality(byId.data);
      }
    }
    if (env.name) {
      const byName = await fetchMunicipalityByName(env.name);
      if (byName) return mapMunicipality(byName);
    }
    const fallback = await fetchDefaultMunicipalityRecord(env.name || null);
    return fallback ? mapMunicipality(fallback) : null;
  }

  const normalizedSubdomain = (subdomain || "").trim().toLowerCase();
  if (normalizedSubdomain) {
    const idBySub = await resolveMunicipalityIdBySubdomain(normalizedSubdomain);
    if (idBySub) {
      const byId = await supabase.from("municipalities").select("*").eq("id", idBySub).maybeSingle();
      if (byId.data) return mapMunicipality(byId.data);
    }
  }

  if (normalizedHost) {
    const byHost = await supabase
      .from("municipalities")
      .select("*")
      .or(`custom_domain.ilike.${normalizedHost},slug.ilike.${normalizedHost}`)
      .maybeSingle();
    if (byHost.data) return mapMunicipality(byHost.data);
  }

  return null;
}

export async function loadMunicipalityBundleByUserId(
  userId: string | null | undefined,
): Promise<MunicipalityBundle | null> {
  if (!hasSupabaseEnv || !supabase || !userId) return null;

  const profileResult = await supabase
    .from("profiles")
    .select("municipality_id, updated_at, deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profileResult.error) {
    if (isMissingRelationError(profileResult.error, "public.profiles"))
      return null;
    throw profileResult.error;
  }

  let municipalityId = profileResult.data?.municipality_id as
    | string
    | null
    | undefined;

  if (!municipalityId) {
    const membershipResult = await supabase
      .from("tenant_memberships")
      .select("tenant_id, deleted_at, is_active")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (membershipResult.error) {
      if (
        !isMissingRelationError(
          membershipResult.error,
          "public.tenant_memberships",
        )
      ) {
        throw membershipResult.error;
      }
    } else {
      municipalityId =
        (membershipResult.data?.tenant_id as string | null | undefined) ?? null;
    }
  }

  if (!municipalityId) return null;

  const municipalityResult = await supabase
    .from("municipalities")
    .select("*")
    .eq("id", municipalityId)
    .maybeSingle();

  if (municipalityResult.error) {
    if (
      !isMissingRelationError(municipalityResult.error, "public.municipalities")
    )
      throw municipalityResult.error;
    return null;
  }

  const municipality = municipalityResult.data
    ? mapMunicipality(municipalityResult.data)
    : null;
  if (!municipality?.id) return null;

  const { branding, settings } = await loadBrandingAndSettings(municipality.id);
  return { municipality, branding, settings };
}

export async function loadMunicipalityBundleById(
  municipalityId: string | null | undefined,
): Promise<MunicipalityBundle | null> {
  if (!hasSupabaseEnv || !supabase || !municipalityId) return null;

  const municipalityResult = await supabase
    .from("municipalities")
    .select("*")
    .eq("id", municipalityId)
    .maybeSingle();

  if (municipalityResult.error) {
    if (
      isMissingRelationError(
        municipalityResult.error,
        "public.municipalities",
      )
    )
      throw municipalityResult.error;
    return null;
  }

  const municipality = municipalityResult.data
    ? mapMunicipality(municipalityResult.data)
    : null;
  if (!municipality?.id) return null;

  const { branding, settings } = await loadBrandingAndSettings(municipality.id);
  return { municipality, branding, settings };
}

export async function loadMunicipalityBundleBySubdomain(
  subdomain: string | null | undefined,
): Promise<MunicipalityBundle | null> {
  if (!hasSupabaseEnv || !supabase || !subdomain) return null;

  const candidates = buildSubdomainCandidates(subdomain);
  if (candidates.length === 0) return null;

  let municipalityResult = await supabase
    .from("municipalities")
    .select("*")
    .or(buildSubdomainOrFilter(candidates[0]))
    .maybeSingle();

  if (!municipalityResult.data && !municipalityResult.error && candidates.length > 1) {
    for (let i = 1; i < candidates.length; i += 1) {
      municipalityResult = await supabase
        .from("municipalities")
        .select("*")
        .or(buildSubdomainOrFilter(candidates[i]))
        .maybeSingle();
      if (municipalityResult.data || municipalityResult.error) break;
    }
  }

  if (municipalityResult.error) {
    if (
      isMissingRelationError(municipalityResult.error, "public.municipalities")
    )
      return null;
    throw municipalityResult.error;
  }

  const municipality = municipalityResult.data
    ? mapMunicipality(municipalityResult.data)
    : null;
  if (!municipality?.id) return null;

  const { branding, settings } = await loadBrandingAndSettings(municipality.id);
  return { municipality, branding, settings };
}

export async function resolveMunicipalityIdBySubdomain(
  subdomain: string | null | undefined,
): Promise<string | null> {
  if (!hasSupabaseEnv || !supabase || !subdomain) return null;

  const candidates = buildSubdomainCandidates(subdomain);
  if (candidates.length === 0) return null;

  let municipalityResult = await supabase
    .from("municipalities")
    .select("id, subdomain, slug")
    .or(buildSubdomainOrFilter(candidates[0]))
    .maybeSingle();

  if (
    !municipalityResult.data &&
    !municipalityResult.error &&
    candidates.length > 1
  ) {
    for (let i = 1; i < candidates.length; i += 1) {
      municipalityResult = await supabase
        .from("municipalities")
        .select("id, subdomain, slug")
        .or(buildSubdomainOrFilter(candidates[i]))
        .maybeSingle();
      if (municipalityResult.data || municipalityResult.error) break;
    }
  }

  if (municipalityResult.error) {
    if (
      isMissingRelationError(municipalityResult.error, "public.municipalities")
    )
      return null;
    throw municipalityResult.error;
  }

  return municipalityResult.data?.id ?? null;
}

export async function resolveMunicipalityIdById(
  municipalityId: string | null | undefined,
): Promise<string | null> {
  if (!hasSupabaseEnv || !supabase || !municipalityId) return null;

  const municipalityResult = await supabase
    .from("municipalities")
    .select("id")
    .eq("id", municipalityId)
    .maybeSingle();

  if (municipalityResult.error) {
    if (
      isMissingRelationError(municipalityResult.error, "public.municipalities")
    )
      return null;
    throw municipalityResult.error;
  }

  return municipalityResult.data?.id ?? null;
}

export async function loadMunicipalityBundleByHostname(
  hostname: string | null | undefined,
): Promise<MunicipalityBundle | null> {
  if (!hasSupabaseEnv || !supabase || !hostname) return null;

  const normalized = hostname.trim().toLowerCase();

  const municipalityResult = await supabase
    .from("municipalities")
    .select("*")
    .or(`custom_domain.ilike.${normalized},subdomain.ilike.${normalized}`)
    .maybeSingle();

  if (municipalityResult.error) {
    if (
      isMissingRelationError(municipalityResult.error, "public.municipalities")
    )
      return null;
    throw municipalityResult.error;
  }

  const municipality = municipalityResult.data
    ? mapMunicipality(municipalityResult.data)
    : null;
  if (!municipality?.id) return null;

  const { branding, settings } = await loadBrandingAndSettings(municipality.id);
  return { municipality, branding, settings };
}

export async function loadMunicipalityCatalog(): Promise<MunicipalityBundle[]> {
  if (!hasSupabaseEnv || !supabase) return [];

  const [municipalitiesResult, brandingResult, settingsResult] =
    await Promise.all([
      supabase
        .from("municipalities")
        .select("*")
        .order("name", { ascending: true }),
      supabase.from("municipality_branding").select("*"),
      supabase.from("municipality_settings").select("*"),
    ]);

  const errors = [
    isMissingRelationError(municipalitiesResult.error, "public.municipalities")
      ? null
      : municipalitiesResult.error,
    isMissingRelationError(brandingResult.error, "public.municipality_branding")
      ? null
      : brandingResult.error,
    isMissingRelationError(settingsResult.error, "public.municipality_settings")
      ? null
      : settingsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) throw errors[0];

  const brandingByMunicipality = new Map(
    (brandingResult.data ?? []).map((record: any) => [
      record.municipality_id,
      mapMunicipalityBranding(record),
    ]),
  );
  const settingsByMunicipality = new Map(
    (settingsResult.data ?? []).map((record: any) => [
      record.municipality_id,
      mapMunicipalitySettings(record),
    ]),
  );

  return (municipalitiesResult.data ?? []).map((record: any) => {
    const municipality = mapMunicipality(record);
    return {
      municipality,
      branding: brandingByMunicipality.get(municipality.id) ?? null,
      settings: settingsByMunicipality.get(municipality.id) ?? null,
    };
  });
}
