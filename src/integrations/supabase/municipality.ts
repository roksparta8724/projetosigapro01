import { hasSupabaseEnv, supabase } from "@/integrations/supabase/client";
import type {
  Municipality,
  MunicipalityBranding,
  MunicipalityBundle,
  MunicipalitySettings,
} from "@/lib/municipality";

function isMissingRelationError(error: unknown, relationName: string) {
  if (!error || typeof error !== "object") return false;

  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const details = "details" in error && typeof error.details === "string" ? error.details : "";
  const hint = "hint" in error && typeof error.hint === "string" ? error.hint : "";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const blob = `${message} ${details} ${hint}`.toLowerCase();

  return code === "PGRST205" || blob.includes(relationName.toLowerCase());
}

function mapMunicipality(record: any): Municipality {
  return {
    id: record.id,
    name: record.name ?? "",
    state: record.state ?? "",
    slug: record.slug ?? "",
    subdomain: record.subdomain ?? "",
    customDomain: record.custom_domain ?? "",
    status: record.status ?? "active",
    secretariatName: record.secretariat_name ?? "",
    email: record.email ?? "",
    phone: record.phone ?? "",
    address: record.address ?? "",
    createdAt: record.created_at ?? "",
    updatedAt: record.updated_at ?? "",
  };
}

function mapMunicipalityBranding(record: any): MunicipalityBranding {
  return {
    id: record.id,
    municipalityId: record.municipality_id,
    logoUrl: record.logo_url ?? "",
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
    requireProfessionalRegistration: Boolean(record.require_professional_registration ?? true),
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

export async function loadMunicipalityBundleByUserId(
  userId: string | null | undefined,
): Promise<MunicipalityBundle | null> {
  if (!hasSupabaseEnv || !supabase || !userId) {
    return null;
  }

  const profileResult = await supabase
    .from("profiles")
    .select("municipality_id, updated_at, deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profileResult.error) {
    if (isMissingRelationError(profileResult.error, "public.profiles")) {
      return null;
    }
    throw profileResult.error;
  }

  let municipalityId = profileResult.data?.municipality_id as string | null | undefined;
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
      if (!isMissingRelationError(membershipResult.error, "public.tenant_memberships")) {
        throw membershipResult.error;
      }
    } else {
      municipalityId = (membershipResult.data?.tenant_id as string | null | undefined) ?? null;
    }
  }

  if (!municipalityId) {
    return null;
  }

  const [municipalityResult, brandingResult, settingsResult] = await Promise.all([
    supabase.from("municipalities").select("*").eq("id", municipalityId).maybeSingle(),
    supabase.from("municipality_branding").select("*").eq("municipality_id", municipalityId).maybeSingle(),
    supabase.from("municipality_settings").select("*").eq("municipality_id", municipalityId).maybeSingle(),
  ]);

  const errors = [
    municipalityResult.error,
    isMissingRelationError(brandingResult.error, "public.municipality_branding")
      ? null
      : brandingResult.error,
    isMissingRelationError(settingsResult.error, "public.municipality_settings")
      ? null
      : settingsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  return {
    municipality: municipalityResult.data ? mapMunicipality(municipalityResult.data) : null,
    branding: brandingResult.data ? mapMunicipalityBranding(brandingResult.data) : null,
    settings: settingsResult.data ? mapMunicipalitySettings(settingsResult.data) : null,
  };
}

export async function loadMunicipalityBundleById(
  municipalityId: string | null | undefined,
): Promise<MunicipalityBundle | null> {
  if (!hasSupabaseEnv || !supabase || !municipalityId) {
    return null;
  }

  const [municipalityResult, brandingResult, settingsResult] = await Promise.all([
    supabase.from("municipalities").select("*").eq("id", municipalityId).maybeSingle(),
    supabase.from("municipality_branding").select("*").eq("municipality_id", municipalityId).maybeSingle(),
    supabase.from("municipality_settings").select("*").eq("municipality_id", municipalityId).maybeSingle(),
  ]);

  const errors = [
    isMissingRelationError(municipalityResult.error, "public.municipalities") ? null : municipalityResult.error,
    isMissingRelationError(brandingResult.error, "public.municipality_branding") ? null : brandingResult.error,
    isMissingRelationError(settingsResult.error, "public.municipality_settings") ? null : settingsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  return {
    municipality: municipalityResult.data ? mapMunicipality(municipalityResult.data) : null,
    branding: brandingResult.data ? mapMunicipalityBranding(brandingResult.data) : null,
    settings: settingsResult.data ? mapMunicipalitySettings(settingsResult.data) : null,
  };
}

export async function loadMunicipalityCatalog(): Promise<MunicipalityBundle[]> {
  if (!hasSupabaseEnv || !supabase) {
    return [];
  }

  const [municipalitiesResult, brandingResult, settingsResult] = await Promise.all([
    supabase.from("municipalities").select("*").order("name", { ascending: true }),
    supabase.from("municipality_branding").select("*"),
    supabase.from("municipality_settings").select("*"),
  ]);

  const errors = [
    isMissingRelationError(municipalitiesResult.error, "public.municipalities") ? null : municipalitiesResult.error,
    isMissingRelationError(brandingResult.error, "public.municipality_branding") ? null : brandingResult.error,
    isMissingRelationError(settingsResult.error, "public.municipality_settings") ? null : settingsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  const brandingByMunicipality = new Map(
    (brandingResult.data ?? []).map((record: any) => [record.municipality_id, mapMunicipalityBranding(record)]),
  );
  const settingsByMunicipality = new Map(
    (settingsResult.data ?? []).map((record: any) => [record.municipality_id, mapMunicipalitySettings(record)]),
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
