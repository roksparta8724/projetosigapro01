import { useEffect, useState } from "react";
import { Building2 } from "@/components/platform/PremiumIcons";
import { getPublicAssetUrl, resolveAssetUrl } from "@/lib/assetUrl";
import { cn } from "@/lib/utils";
import type { InstitutionalBranding } from "@/lib/institutionBranding";

interface InstitutionalLogoProps {
  branding: InstitutionalBranding;
  fallbackLabel?: string;
  variant?: "header" | "footer" | "preview" | "compact" | "login";
  className?: string;
  viewportClassName?: string;
}

const SIGAPRO_OFFICIAL_LOGO = getPublicAssetUrl("sigapro-logo.png");
const LOGO_SESSION_CACHE_KEY = "sigapro.institutional-logo.v1";

const variantClasses = {
  header: "h-[112px] w-[188px] p-4 lg:h-[120px] lg:w-[204px]",
  footer: "h-[140px] w-[188px] p-4",
  preview: "h-[140px] w-full max-w-[204px] p-4",
  compact: "h-10 w-10 p-1.5",
  login: "h-full w-full p-2",
} as const;

const masterVariantClasses = {
  header: "h-[128px] w-[128px]",
  footer: "h-[144px] w-[144px]",
  preview: "h-[144px] w-[144px]",
  compact: "h-10 w-10",
  login: "h-full w-full",
} as const;

function readSessionLogo(context: string) {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.sessionStorage.getItem(LOGO_SESSION_CACHE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed?.[context] === "string" ? parsed[context] : "";
  } catch {
    return "";
  }
}

function writeSessionLogo(context: string, url: string) {
  if (typeof window === "undefined" || !url) return;
  try {
    const raw = window.sessionStorage.getItem(LOGO_SESSION_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
    parsed[context] = url;
    window.sessionStorage.setItem(LOGO_SESSION_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // noop
  }
}

export function InstitutionalLogo({
  branding,
  fallbackLabel = "Prefeitura",
  variant = "header",
  className,
  viewportClassName,
}: InstitutionalLogoProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [fallbackReady, setFallbackReady] = useState(false);
  const isMaster = branding.tenantId === "master";
  const context = `${variant}:${branding.tenantId}`;
  const requestedUrl = resolveAssetUrl(branding.logoUrl);
  const primaryUrl = requestedUrl || (isMaster ? SIGAPRO_OFFICIAL_LOGO : "");
  const imageUrl = failedSources.includes(primaryUrl)
    ? isMaster && primaryUrl !== SIGAPRO_OFFICIAL_LOGO && !failedSources.includes(SIGAPRO_OFFICIAL_LOGO)
      ? SIGAPRO_OFFICIAL_LOGO
      : ""
    : primaryUrl;

  const [loadedSource, setLoadedSource] = useState(() => ({
    context,
    url: readSessionLogo(context) || imageUrl,
  }));

  const stableLoadedUrl =
    loadedSource.context === context &&
    loadedSource.url &&
    !failedSources.includes(loadedSource.url)
      ? loadedSource.url
      : "";

  const cachedContextUrl = readSessionLogo(context);
  const safeCachedUrl =
    cachedContextUrl && !failedSources.includes(cachedContextUrl)
      ? cachedContextUrl
      : "";

  // Stale-while-revalidate visual:
  // 1) mantém a última imagem já válida;
  // 2) em um F5 reutiliza imediatamente a imagem da sessão;
  // 3) nunca cobre uma imagem válida com skeleton/opacity-0;
  // 4) uma URL nova só substitui a anterior depois de carregar.
  const displayUrl = stableLoadedUrl || safeCachedUrl || imageUrl;
  const pendingUrl = imageUrl && imageUrl !== displayUrl ? imageUrl : "";

  const scale = Number.isFinite(branding.logoScale) ? Math.max(0.35, Math.min(5, branding.logoScale)) : 1;
  const frameSize = variant === "header" ? 128 : 144;
  const frameRatio = frameSize / 160;
  const offsetX = (branding.logoOffsetX || 0) * frameRatio;
  const offsetY = (branding.logoOffsetY || 0) * frameRatio;
  const showCrop = variant === "header" || variant === "footer" || variant === "preview";

  useEffect(() => {
    if (displayUrl) {
      setFallbackReady(false);
      return;
    }
    const timer = window.setTimeout(() => setFallbackReady(true), 500);
    return () => window.clearTimeout(timer);
  }, [context, displayUrl]);

  return (
    <div
      data-logo-context={isMaster ? "sigapro" : "municipality"}
      className={cn(
        "sig-institution-logo-surface flex max-w-full shrink-0 items-center justify-center overflow-hidden",
        isMaster
          ? "bg-transparent"
          : "rounded-[22px] border border-slate-200/80 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.12)]",
        isMaster ? masterVariantClasses[variant] : variantClasses[variant],
        className,
      )}
    >
      <div className={cn("flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden", viewportClassName)}>
        <div className="relative flex h-full w-full items-center justify-center">
          {!displayUrl && fallbackReady ? (
            <div
              className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-1 bg-white text-slate-400"
              role="img"
              aria-label={fallbackLabel}
            >
              <Building2 className={cn("shrink-0", variant === "compact" ? "h-4 w-4" : "h-8 w-8")} />
              {variant !== "compact" ? (
                <span className="max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.1em]">
                  {isMaster ? "SIGAPRO" : "Prefeitura"}
                </span>
              ) : null}
            </div>
          ) : null}

          {displayUrl ? (
            <img
              src={displayUrl}
              alt={branding.logoAlt || fallbackLabel}
              className={cn(
                "block h-full w-full max-w-full select-none object-contain object-center",
                isMaster && "mix-blend-screen",
              )}
              style={showCrop ? { transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`, transformOrigin: "center center" } : undefined}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              onLoad={() => {
                setLoadedSource({ context, url: displayUrl });
                writeSessionLogo(context, displayUrl);
              }}
              onError={() => setFailedSources((current) => current.includes(displayUrl) ? current : [...current, displayUrl])}
            />
          ) : null}
        </div>

        {pendingUrl ? (
          <img
            src={pendingUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute h-px w-px opacity-0"
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            onLoad={() => {
              writeSessionLogo(context, pendingUrl);
              setLoadedSource({ context, url: pendingUrl });
            }}
            onError={() => setFailedSources((current) => current.includes(pendingUrl) ? current : [...current, pendingUrl])}
          />
        ) : null}
      </div>
    </div>
  );
}
