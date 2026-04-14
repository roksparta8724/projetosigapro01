import { createContext, useContext, useEffect, useMemo } from "react";
import type { MunicipalityBundle } from "@/lib/municipality";
import { isRootDomainHost, resolveTenantFromLocation } from "@/lib/tenant";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";

interface TenantContextValue {
  loading: boolean;
  mode: "root" | "tenant";
  subdomain: string | null;
  isReserved: boolean;
  isLocalhost: boolean;
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
  const bootstrap = useAppBootstrap();
  const resolution = bootstrap.resolution ?? resolveTenantFromLocation();
  const bundle: MunicipalityBundle | null =
    bootstrap.scopeType === "platform" ? null : bootstrap.municipalityBundle ?? null;
  const loading = bootstrap.loading;

  useEffect(() => {
    if (typeof document === "undefined") return;

    const branding = bundle?.branding ?? null;
    const faviconUrl = branding?.logoUrl || branding?.coatOfArmsUrl || "/favicon-sigapro.svg";
    const link =
      document.querySelector<HTMLLinkElement>("link[rel='icon']") ||
      document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']");

    if (link && faviconUrl) {
      link.href = faviconUrl;
    }
  }, [bundle?.branding]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (bootstrap.scopeType !== "platform" && resolution.mode === "tenant" && bundle?.municipality?.name) {
      document.title = `${bundle.municipality.name} | SIGAPRO`;
      return;
    }
    document.title = "SIGAPRO | Plataforma institucional de projetos";
  }, [bootstrap.scopeType, bundle?.municipality?.name, resolution.mode]);

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
      isLocalhost: resolution.isLocalhost,
      municipalityBundle: bundle,
      municipalityId: municipality?.id ?? null,
      municipalityName: municipality?.name ?? null,
      municipalityStatus: status,
      inactive,
      notFound:
        (resolution.mode === "tenant" || (!resolution.isLocalhost && !isRootDomainHost(resolution.hostname))) &&
        !resolution.isReserved &&
        !loading &&
        (bootstrap.stage === "tenant_not_found" || (!municipality && bootstrap.isReady)),
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
