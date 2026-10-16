/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
import { createContext, useContext, useEffect, useMemo } from "react";
import type { MunicipalityBundle } from "@/lib/municipality";
import { getPublicAssetUrl, resolveAssetUrl } from "@/lib/assetUrl";
import { isRootDomainHost, resolveTenantFromLocation } from "@/lib/tenant";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { getPublicUrl, getSignedUrlForObject } from "@/integrations/r2/client";

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

    let active = true;
    const branding = bundle?.branding ?? null;
    const fallback = getPublicAssetUrl("favicon-sigapro.svg");

    const ensureIconLink = () => {
      const existing =
        document.querySelector<HTMLLinkElement>("link[rel='icon']") ||
        document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']");
      if (existing) return existing;

      const created = document.createElement("link");
      created.rel = "icon";
      created.type = "image/png";
      document.head.appendChild(created);
      return created;
    };

    const isTemporarySignedUrl = (value: string) =>
      /[?&]X-Amz-(?:Algorithm|Credential|Date|Expires|Signature|SignedHeaders)=/i.test(
        value,
      );

    void (async () => {
      const objectKey =
        branding?.headerLogoObjectKey?.trim() ||
        branding?.logoObjectKey?.trim() ||
        "";

      let faviconUrl = "";

      if (objectKey) {
        try {
          faviconUrl =
            getPublicUrl(objectKey) ||
            (await getSignedUrlForObject({
              bucket: "institutional-branding",
              objectKey,
            })) ||
            "";
        } catch {
          faviconUrl = "";
        }
      }

      if (!faviconUrl) {
        const storedUrl =
          branding?.headerLogoUrl?.trim() ||
          branding?.logoUrl?.trim() ||
          branding?.coatOfArmsUrl?.trim() ||
          "";
        if (storedUrl && !isTemporarySignedUrl(storedUrl)) {
          faviconUrl = resolveAssetUrl(storedUrl);
        }
      }

      if (!active) return;
      const link = ensureIconLink();
      const finalUrl = faviconUrl || fallback;
      link.href = finalUrl;

      if (/\.jpe?g(?:$|\?)/i.test(finalUrl)) {
        link.type = "image/jpeg";
      } else if (/\.png(?:$|\?)/i.test(finalUrl)) {
        link.type = "image/png";
      } else if (/\.svg(?:$|\?)/i.test(finalUrl)) {
        link.type = "image/svg+xml";
      } else {
        link.removeAttribute("type");
      }
    })();

    return () => {
      active = false;
    };
  }, [
    bundle?.branding?.coatOfArmsUrl,
    bundle?.branding?.headerLogoObjectKey,
    bundle?.branding?.headerLogoUrl,
    bundle?.branding?.logoObjectKey,
    bundle?.branding?.logoUrl,
  ]);

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
