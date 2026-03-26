import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { loadMunicipalityBundleByUserId } from "@/integrations/supabase/municipality";
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
  const { authenticatedUserId } = useAuthGateway();
  const { session } = usePlatformSession();
  const { institutions, getInstitutionSettings } = usePlatformData();
  const [bundle, setBundle] = useState<{
    municipality: Municipality | null;
    branding: MunicipalityBranding | null;
    settings: MunicipalitySettings | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const activeInstitutionId = bundle?.municipality?.id ?? session.municipalityId ?? session.tenantId ?? null;
  const institution = institutions.find((item) => item.id === activeInstitutionId) ?? null;
  const fallbackInstitutionSettings = getInstitutionSettings(activeInstitutionId);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const nextBundle = await loadMunicipalityBundleByUserId(authenticatedUserId);
        if (!active) return;
        setBundle(nextBundle);
      } catch {
        if (!active) return;
        setBundle(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [authenticatedUserId]);

  const value = useMemo<MunicipalityContextValue>(() => {
    const municipality = bundle?.municipality ?? null;
    const branding = bundle?.branding ?? null;
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
