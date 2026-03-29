import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  loadMunicipalityBundleByHostname,
  loadMunicipalityBundleBySubdomain,
} from "@/integrations/supabase/municipality";
import type { MunicipalityBundle } from "@/lib/municipality";
import { isRootDomainHost, resolveTenantFromLocation } from "@/lib/tenant";

interface TenantContextValue {
  loading: boolean;
  mode: "root" | "tenant";
  subdomain: string | null;
  isReserved: boolean;
  municipalityBundle: MunicipalityBundle | null;
  municipalityId: string | null;
  municipalityName: string | null;
  municipalityStatus: string | null;
  inactive: boolean;
  notFound: boolean;
  hostname: string;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<MunicipalityBundle | null>(null);
  const [resolution, setResolution] = useState(() => resolveTenantFromLocation());

  useEffect(() => {
    setResolution(resolveTenantFromLocation());
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        let nextBundle: MunicipalityBundle | null = null;

        if (resolution.mode === "tenant" && resolution.subdomain && !resolution.isReserved) {
          nextBundle = await loadMunicipalityBundleBySubdomain(resolution.subdomain);
        } else if (!resolution.isLocalhost && resolution.hostname && !isRootDomainHost(resolution.hostname)) {
          nextBundle = await loadMunicipalityBundleByHostname(resolution.hostname);
        }

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
  }, [resolution.isReserved, resolution.mode, resolution.subdomain]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const branding = bundle?.branding ?? null;
    const faviconUrl = branding?.logoUrl || branding?.coatOfArmsUrl || "/favicon.png";
    const link =
      document.querySelector<HTMLLinkElement>("link[rel='icon']") ||
      document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']");

    if (link && faviconUrl) {
      link.href = faviconUrl;
    }
  }, [bundle?.branding]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (resolution.mode === "tenant" && bundle?.municipality?.name) {
      document.title = `${bundle.municipality.name} | SIGAPRO`;
      return;
    }
    document.title = "SIGAPRO | Plataforma institucional de projetos";
  }, [bundle?.municipality?.name, resolution.mode]);

  const value = useMemo<TenantContextValue>(() => {
    const municipality = bundle?.municipality ?? null;
    const status = municipality?.status ?? null;
    const inactive =
      Boolean(status) &&
      ["inactive", "inativo", "suspenso", "suspended", "blocked", "bloqueado"].includes(status.toLowerCase());
    return {
      loading,
      mode: resolution.mode,
      subdomain: resolution.subdomain,
      isReserved: resolution.isReserved,
      municipalityBundle: bundle,
      municipalityId: municipality?.id ?? null,
      municipalityName: municipality?.name ?? null,
      municipalityStatus: status,
      inactive,
      notFound:
        (resolution.mode === "tenant" || (!resolution.isLocalhost && !isRootDomainHost(resolution.hostname))) &&
        !resolution.isReserved &&
        !loading &&
        !municipality,
      hostname: resolution.hostname,
    };
  }, [bundle, loading, resolution.hostname, resolution.isReserved, resolution.mode, resolution.subdomain]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used inside TenantProvider");
  }
  return context;
}
