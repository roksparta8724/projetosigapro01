import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useTenant } from "@/hooks/useTenant";
import { getPublicUrl, getSignedUrlForObject } from "@/integrations/r2/client";
import { getMunicipalityBrandingSafe } from "@/integrations/supabase/platform";
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

export function MunicipalityProvider({ children }: { children: React.ReactNode }) {
  const bootstrap = useAppBootstrap();
  const { session } = usePlatformSession();
  const { institutions, getInstitutionSettings } = usePlatformData();
  const tenant = useTenant();
  const bundle =
    bootstrap.scopeType === "platform" ? null : bootstrap.municipalityBundle ?? tenant.municipalityBundle ?? null;
  const loading = bootstrap.loading || tenant.loading;
  const [resolvedBranding, setResolvedBranding] = useState<MunicipalityBranding | null>(null);
  const [brandingReloadToken, setBrandingReloadToken] = useState(0);
  const brandingResolveRef = useRef<{ headerKey: string; footerKey: string }>({
    headerKey: "",
    footerKey: "",
  });
  const brandingFetchRef = useRef<{ id: string; inFlight: boolean }>({ id: "", inFlight: false });

  const activeInstitutionId =
    tenant.municipalityId ?? bundle?.municipality?.id ?? session.municipalityId ?? session.tenantId ?? null;
  const institution = institutions.find((item) => item.id === activeInstitutionId) ?? null;
  const fallbackInstitutionSettings = getInstitutionSettings(activeInstitutionId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ municipalityId?: string }>).detail;
      if (detail?.municipalityId && detail.municipalityId !== bundle?.municipality?.id) return;
      console.log("[BrandingLoad] Evento de branding atualizado recebido");
      brandingFetchRef.current = { id: "", inFlight: false };
      brandingResolveRef.current = { headerKey: "", footerKey: "" };
      setResolvedBranding(null);
      setBrandingReloadToken((current) => current + 1);
    };
    window.addEventListener("sigapro-branding-updated", handler as EventListener);
    return () => window.removeEventListener("sigapro-branding-updated", handler as EventListener);
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
        setResolvedBranding(null);
        return;
      }
      brandingFetchRef.current = { id: municipalityId, inFlight: true };
      console.log("[BrandingLoad] Branding ausente no bundle, buscando direto", { municipalityId });
      void (async () => {
        try {
          const fetched = await getMunicipalityBrandingSafe(municipalityId);
          if (!fetched) {
            setResolvedBranding(null);
            return;
          }
          const headerKey = (fetched as MunicipalityBranding).headerLogoObjectKey || "";
          const footerKey = (fetched as MunicipalityBranding).footerLogoObjectKey || "";
          const hasPublicBase = Boolean(getPublicUrl("test"));
          let next = { ...(fetched as MunicipalityBranding) };
          const bucket =
            (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) ||
            "sigapro-logos";
          if (headerKey) {
            const publicUrl = hasPublicBase ? getPublicUrl(headerKey) : "";
            const signedUrl = publicUrl || (await getSignedUrlForObject({ bucket, objectKey: headerKey }));
            if (signedUrl) {
              next = { ...next, headerLogoUrl: signedUrl, logoUrl: next.logoUrl || signedUrl };
            }
          }
          if (footerKey) {
            const publicUrl = hasPublicBase ? getPublicUrl(footerKey) : "";
            const signedUrl = publicUrl || (await getSignedUrlForObject({ bucket, objectKey: footerKey }));
            if (signedUrl) {
              next = { ...next, footerLogoUrl: signedUrl, logoUrl: next.logoUrl || signedUrl };
            }
          }
          setResolvedBranding(next);
        } catch (error) {
          console.warn("[BrandingLoad] Falha ao buscar branding direto", error);
          setResolvedBranding(null);
        } finally {
          brandingFetchRef.current.inFlight = false;
        }
      })();
      return;
    }

    const headerKey = branding.headerLogoObjectKey || "";
    const footerKey = branding.footerLogoObjectKey || "";
    const hasPublicBase = Boolean(getPublicUrl("test"));

    if (!headerKey && !footerKey) {
      setResolvedBranding(null);
      return;
    }

    if (
      brandingResolveRef.current.headerKey === headerKey &&
      brandingResolveRef.current.footerKey === footerKey
    ) {
      return;
    }

    let active = true;

    console.log("[BrandingLoad] Resolvendo URLs do branding", {
      headerKey,
      footerKey,
      hasPublicBase,
    });

    const resolveSigned = async () => {
      let next = { ...branding };
      try {
        const bucket =
          (import.meta.env.VITE_R2_BUCKET_LOGOS as string | undefined) ||
          "sigapro-logos";

        if (headerKey) {
          const publicUrl = hasPublicBase ? getPublicUrl(headerKey) : "";
          const signedUrl = publicUrl || (await getSignedUrlForObject({ bucket, objectKey: headerKey }));
          if (signedUrl) {
            next = {
              ...next,
              headerLogoUrl: signedUrl,
              logoUrl: next.logoUrl || signedUrl,
            };
          }
        }

        if (footerKey) {
          const publicUrl = hasPublicBase ? getPublicUrl(footerKey) : "";
          const signedUrl = publicUrl || (await getSignedUrlForObject({ bucket, objectKey: footerKey }));
          if (signedUrl) {
            next = {
              ...next,
              footerLogoUrl: signedUrl,
              logoUrl: next.logoUrl || signedUrl,
            };
          }
        }
      } catch (error) {
        console.warn("[Municipality] Falha ao resolver URL assinada do logo", error);
      }

      if (!active) return;
      brandingResolveRef.current = { headerKey, footerKey };
      console.log("[BrandingLoad] URLs resolvidas", {
        headerLogoUrl: next.headerLogoUrl,
        footerLogoUrl: next.footerLogoUrl,
      });
      setResolvedBranding(next);
    };

    void resolveSigned();

    return () => {
      active = false;
    };
  }, [
    bootstrap.scopeType,
    bundle?.branding?.headerLogoObjectKey,
    bundle?.branding?.footerLogoObjectKey,
    bundle?.municipality?.id,
    tenant.municipalityId,
    brandingReloadToken,
  ]);

  const value = useMemo<MunicipalityContextValue>(() => {
    const municipality = bundle?.municipality ?? null;
    const branding = resolvedBranding ?? bundle?.branding ?? null;
    const settings = bundle?.settings ?? null;
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
  }, [activeInstitutionId, bundle, fallbackInstitutionSettings, institution, loading]);

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
