/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useTenant } from "@/hooks/useTenant";
import { getMunicipalityLogoOpenUrl } from "@/integrations/r2/client";
import { getMunicipalityBrandingSafe } from "@/integrations/backend/platform";
import { mapMunicipalityBranding, mapMunicipalitySettings } from "@/integrations/backend/municipality";
import { backendClient } from "@/integrations/backend/databaseClient";
import {
  buildTenantSettingsFromMunicipality,
  getMunicipalityTheme,
  type Municipality,
  type MunicipalityBranding,
  type MunicipalitySettings,
} from "@/lib/municipality";
import type { TenantSettings } from "@/lib/platform";

interface MunicipalityContextValue {
  loading: boolean;
  source: "municipality" | "tenant-fallback" | "system-fallback";
  municipalityId: string | null;
  scopeId: string | null;
  municipality: Municipality | null;
  branding: MunicipalityBranding | null;
  settings: MunicipalitySettings | null;
  institutionSettingsCompat: TenantSettings | null;
  tenantSettingsCompat: TenantSettings | null;
  name: string;
  theme: {
    primary: string;
    accent: string;
  };
}

const MunicipalityContext = createContext<MunicipalityContextValue | null>(null);

/**
 * Resolve the official R2 object keys using the app's stable image endpoint.
 * Do not delay the municipal dashboard on signed-URL round trips, or persist
 * temporary signed URLs as if they were the official branding.
 */
export function withMunicipalLogoOpenUrls(branding: MunicipalityBranding): MunicipalityBranding {
  const header = branding.headerLogoObjectKey
    ? getMunicipalityLogoOpenUrl(branding.headerLogoObjectKey)
    : branding.headerLogoUrl || branding.logoUrl || "";
  const footer = branding.footerLogoObjectKey
    ? getMunicipalityLogoOpenUrl(branding.footerLogoObjectKey)
    : branding.footerLogoUrl || branding.logoUrl || header;
  return {
    ...branding,
    headerLogoUrl: header,
    footerLogoUrl: footer,
    logoUrl: branding.logoUrl || header,
  };
}

export function MunicipalityProvider({ children }: { children: React.ReactNode }) {
  const bootstrap = useAppBootstrap();
  const { session } = usePlatformSession();
  const { institutions, getInstitutionSettings } = usePlatformData();
  const tenant = useTenant();
  const bundle =
    bootstrap.scopeType === "platform" ? null : bootstrap.municipalityBundle ?? tenant.municipalityBundle ?? null;
  const loading = bootstrap.loading || tenant.loading;
  const [resolvedBranding, setResolvedBranding] = useState<MunicipalityBranding | null>(null);
  // The app bootstrap bundle is a snapshot. After an administrator updates only
  // the zoom/offset, the image URL is unchanged, but settings MUST refresh too.
  const [resolvedSettings, setResolvedSettings] = useState<MunicipalitySettings | null>(null);
  const brandingRefreshGeneration = useRef(0);
  const brandingResolveRef = useRef<{ headerKey: string; footerKey: string }>({
    headerKey: "",
    footerKey: "",
  });
  const brandingFetchRef = useRef<{ id: string; inFlight: boolean }>({ id: "", inFlight: false });

  const activeInstitutionId =
    bootstrap.scopeType === "platform"
      ? null
      : tenant.municipalityId ??
        bundle?.municipality?.id ??
        session.municipalityId ??
        session.tenantId ??
        null;

  const fallbackInstitutionBySubdomain =
    !activeInstitutionId && tenant.mode === "tenant" && tenant.subdomain
      ? institutions.find((item) => item.subdomain === tenant.subdomain) ?? null
      : null;

  const institution =
    bootstrap.scopeType === "platform"
      ? null
      : institutions.find((item) => item.id === activeInstitutionId) ??
        fallbackInstitutionBySubdomain ??
        null;

  const effectiveInstitutionId = activeInstitutionId ?? fallbackInstitutionBySubdomain?.id ?? null;
  const fallbackInstitutionSettings = getInstitutionSettings(effectiveInstitutionId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ municipalityId?: string }>).detail;
      if (detail?.municipalityId && detail.municipalityId !== bundle?.municipality?.id) return;
      const municipalityId = detail?.municipalityId || bundle?.municipality?.id;
      if (!municipalityId) return;
      const generation = ++brandingRefreshGeneration.current;
      brandingFetchRef.current = { id: "", inFlight: false };
      brandingResolveRef.current = { headerKey: "", footerKey: "" };
      // Reload BOTH tables: municipality_branding contains image references,
      // municipality_settings.general_settings stores the actual framing.
      void (async () => {
        const [fetched, settingsResponse] = await Promise.all([
          getMunicipalityBrandingSafe(municipalityId),
          backendClient
            ? backendClient.from("municipality_settings").select("*")
                .eq("municipality_id", municipalityId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (!active || generation !== brandingRefreshGeneration.current) return;
        if (settingsResponse.error) {
          console.warn("[SIGAPRO] Não foi possível atualizar o enquadramento municipal após salvar.");
        } else if (settingsResponse.data) {
          setResolvedSettings(mapMunicipalitySettings(settingsResponse.data as Record<string, unknown>));
        }
        if (!fetched) return;
        const next = withMunicipalLogoOpenUrls(mapMunicipalityBranding(fetched));
        if (active && generation === brandingRefreshGeneration.current) setResolvedBranding(next);
      })().catch((error) => {
        console.warn("[SIGAPRO] Falha ao revalidar identidade institucional após salvar", error);
      });
    };
    window.addEventListener("sigapro-branding-updated", handler as EventListener);
    return () => {
      active = false;
      window.removeEventListener("sigapro-branding-updated", handler as EventListener);
    };
  }, [bundle?.municipality?.id]);

  useEffect(() => {
    if (bootstrap.scopeType === "platform") {
      setResolvedBranding(null);
      return;
    }
    const branding = bundle?.branding ?? null;
    if (!branding) {
      const municipalityId = bundle?.municipality?.id || tenant.municipalityId || null;
      if (!municipalityId || brandingFetchRef.current.inFlight || brandingFetchRef.current.id === municipalityId) {
        return;
      }
      brandingFetchRef.current = { id: municipalityId, inFlight: true };
      console.log("[BrandingLoad] Branding ausente no bundle, buscando direto", { municipalityId });
      void (async () => {
        try {
          const fetched = await getMunicipalityBrandingSafe(municipalityId);
          if (!fetched) {
            return;
          }
          const next = withMunicipalLogoOpenUrls(mapMunicipalityBranding(fetched));
          setResolvedBranding(next);
        } catch (error) {
          console.warn("[BrandingLoad] Falha ao buscar branding direto", error);
        } finally {
          brandingFetchRef.current.inFlight = false;
        }
      })();
      return;
    }

    const headerKey = branding.headerLogoObjectKey || "";
    const footerKey = branding.footerLogoObjectKey || "";
    if (!headerKey && !footerKey) return;
    if (
      brandingResolveRef.current.headerKey === headerKey &&
      brandingResolveRef.current.footerKey === footerKey
    ) return;
    brandingResolveRef.current = { headerKey, footerKey };
    setResolvedBranding(withMunicipalLogoOpenUrls(branding));
  }, [
    bootstrap.scopeType,
    bundle?.branding?.headerLogoObjectKey,
    bundle?.branding?.footerLogoObjectKey,
    bundle?.municipality?.id,
    tenant.municipalityId,
  ]);

  const value = useMemo<MunicipalityContextValue>(() => {
    const municipality = bundle?.municipality ?? null;
    const branding = resolvedBranding?.municipalityId === (municipality?.id ?? activeInstitutionId)
      ? resolvedBranding
      : bundle?.branding ?? null;
    const settings = resolvedSettings?.municipalityId === (municipality?.id ?? activeInstitutionId)
      ? resolvedSettings
      : bundle?.settings ?? null;
    const tenantSettingsCompat = buildTenantSettingsFromMunicipality(
      municipality,
      branding,
      settings,
      fallbackInstitutionSettings,
    );
    const theme = getMunicipalityTheme(branding, institution);

    return {
      loading,
      source: municipality ? "municipality" : institution ? "tenant-fallback" : "system-fallback",
      municipalityId: municipality?.id || null,
      scopeId: municipality?.id || activeInstitutionId || institution?.id || null,
      municipality,
      branding,
      settings,
      institutionSettingsCompat: tenantSettingsCompat,
      tenantSettingsCompat,
      name: municipality?.name || institution?.name || "SIGAPRO",
      theme,
    };
  }, [activeInstitutionId, bundle, fallbackInstitutionSettings, institution, loading, resolvedBranding, resolvedSettings]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--sigapro-municipality-primary", value.theme.primary);
    document.documentElement.style.setProperty("--sigapro-municipality-accent", value.theme.accent);
  }, [value.theme.accent, value.theme.primary]);

  return <MunicipalityContext.Provider value={value}>{children}</MunicipalityContext.Provider>;
}

export function useMunicipality() {
  const context = useContext(MunicipalityContext);
  if (!context) {
    throw new Error("useMunicipality must be used inside MunicipalityProvider");
  }
  return context;
}
