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
  contextScope?: "auto" | "master" | "municipality";
}

const SIGAPRO_OFFICIAL_LOGO = getPublicAssetUrl("sigapro-logo.png");
const LOGO_SESSION_CACHE_KEY = "sigapro.institutional-logo.v3";

const variantClasses = {
  header: "h-[120px] w-[168px] p-0 lg:h-[124px] lg:w-[176px]",
  footer: "h-[128px] w-[176px] p-0",
  preview: "h-[128px] w-[176px] p-0",
  compact: "h-10 w-10 p-0",
  login: "h-full w-full p-0",
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

function assetIdentity(url: string) {
  const value = url.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split("?")[0].split("#")[0];
  }
}

function sameAssetResource(a: string, b: string) {
  return Boolean(a && b && assetIdentity(a) === assetIdentity(b));
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
  contextScope = "auto",
}: InstitutionalLogoProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [fallbackReady, setFallbackReady] = useState(false);
  const isMaster =
    contextScope === "master"
      ? true
      : contextScope === "municipality"
        ? false
        : branding.tenantId === "master";
  const context = `${contextScope}:${variant}:${branding.tenantId}`;

  const requestedCandidate = resolveAssetUrl(branding.logoUrl);
  const municipalFallbackCandidate = resolveAssetUrl(branding.fallbackLogoUrl);

  // A superfície municipal nunca pode reutilizar o logo da plataforma,
  // nem por um frame durante bootstrap, F5 ou renovação de URL assinada.
  const requestedUrl =
    !isMaster && sameAssetResource(requestedCandidate, SIGAPRO_OFFICIAL_LOGO)
      ? ""
      : requestedCandidate;
  const municipalFallbackUrl =
    !isMaster && sameAssetResource(municipalFallbackCandidate, SIGAPRO_OFFICIAL_LOGO)
      ? ""
      : municipalFallbackCandidate;
  const primaryUrl = requestedUrl || (isMaster ? SIGAPRO_OFFICIAL_LOGO : municipalFallbackUrl);
  const secondaryUrl = isMaster
    ? SIGAPRO_OFFICIAL_LOGO
    : municipalFallbackUrl && !sameAssetResource(municipalFallbackUrl, primaryUrl)
      ? municipalFallbackUrl
      : "";
  const imageUrl = failedSources.includes(primaryUrl)
    ? secondaryUrl && !failedSources.includes(secondaryUrl)
      ? secondaryUrl
      : ""
    : primaryUrl;

  const cachedAtMount = readSessionLogo(context);
  const cachedMatchesCurrentAsset =
    cachedAtMount &&
    !failedSources.includes(cachedAtMount) &&
    [primaryUrl, secondaryUrl].some(
      (candidate) => candidate && sameAssetResource(cachedAtMount, candidate),
    );

  const [loadedSource, setLoadedSource] = useState(() => ({
    context,
    url: cachedMatchesCurrentAsset ? cachedAtMount : imageUrl,
  }));

  const loadedSourceAllowed =
    isMaster ||
    !sameAssetResource(loadedSource.url, SIGAPRO_OFFICIAL_LOGO);

  const stableLoadedUrl =
    loadedSource.context === context &&
    loadedSource.url &&
    loadedSourceAllowed &&
    !failedSources.includes(loadedSource.url) &&
    [primaryUrl, secondaryUrl].some(
      (candidate) => candidate && sameAssetResource(loadedSource.url, candidate),
    )
      ? loadedSource.url
      : "";

  const cachedContextUrl = readSessionLogo(context);
  const cachedAllowed =
    isMaster ||
    !sameAssetResource(cachedContextUrl, SIGAPRO_OFFICIAL_LOGO);
  const safeCachedUrl =
    cachedContextUrl &&
    cachedAllowed &&
    !failedSources.includes(cachedContextUrl) &&
    [primaryUrl, secondaryUrl].some(
      (candidate) => candidate && sameAssetResource(cachedContextUrl, candidate),
    )
      ? cachedContextUrl
      : "";

  // Stale-while-revalidate visual:
  // 1) mantém a última imagem já válida;
  // 2) em um F5 reutiliza imediatamente a imagem da sessão;
  // 3) nunca cobre uma imagem válida com skeleton/opacity-0;
  // 4) uma URL nova só substitui a anterior depois de carregar.
  const displayUrl = stableLoadedUrl || safeCachedUrl || imageUrl;
  const pendingUrl =
    imageUrl &&
    imageUrl !== displayUrl &&
    !sameAssetResource(imageUrl, displayUrl)
      ? imageUrl
      : "";

  const configuredScale = Number.isFinite(branding.logoScale) ? branding.logoScale : 1;
  // Em logo municipal com object-fit contain, escala abaixo de 1 apenas cria
  // uma margem vazia excessiva. Valores legados menores que 1 sao normalizados
  // visualmente para 1; o editor continua podendo ampliar e reposicionar.
  const scale = isMaster
    ? Math.max(0.35, Math.min(5, configuredScale))
    : Math.max(1, Math.min(5, configuredScale));
  const frameRatio =
    variant === "header"
      ? 124 / 132
      : variant === "footer" || variant === "preview"
        ? 128 / 132
        : 1;
  const offsetX = (branding.logoOffsetX || 0) * frameRatio;
  const offsetY = (branding.logoOffsetY || 0) * frameRatio;
  const showCrop = variant === "header" || variant === "footer" || variant === "preview";

  useEffect(() => {
    // Troca de arquivo, renovacao de URL assinada ou mudanca de contexto deve
    // limpar falhas antigas. Um erro transitório nao pode prender o logo no
    // fallback depois que a fonte oficial ja esta disponivel.
    setFailedSources([]);
    setFallbackReady(false);
  }, [context, requestedUrl, secondaryUrl]);

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
      data-logo-variant={variant}
      className={cn(
        "sig-institution-logo-surface flex max-w-full shrink-0 items-center justify-center overflow-hidden",
        isMaster
          ? "bg-transparent"
          : "rounded-[22px] bg-white",
        isMaster ? masterVariantClasses[variant] : variantClasses[variant],
        className,
      )}
      style={isMaster ? undefined : {
        width: variant === "header" ? 176 : variant === "footer" || variant === "preview" ? 176 : undefined,
        minWidth: variant === "header" ? 176 : variant === "footer" || variant === "preview" ? 176 : undefined,
        maxWidth: variant === "header" ? 176 : variant === "footer" || variant === "preview" ? 176 : undefined,
        height: variant === "header" ? 124 : variant === "footer" || variant === "preview" ? 128 : undefined,
        background: "#ffffff",
        backgroundColor: "#ffffff",
        border: "none",
        boxShadow: "none",
        opacity: 1,
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        mixBlendMode: "normal",
        flex: variant === "header" || variant === "footer" || variant === "preview" ? "0 0 auto" : undefined,
      }}
    >
      <div
        className={cn("flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden", viewportClassName)}
        style={isMaster ? undefined : { background: "#ffffff", backgroundColor: "#ffffff", opacity: 1 }}
      >
        <div
          className="relative flex h-full w-full items-center justify-center"
          style={isMaster ? undefined : { background: "#ffffff", backgroundColor: "#ffffff", opacity: 1 }}
        >
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
                !isMaster && "rounded-[22px] bg-white",
                isMaster && "mix-blend-screen",
              )}
              style={showCrop ? { transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`, transformOrigin: "center center" } : undefined}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              onLoad={() => {
                setLoadedSource({ context, url: displayUrl });
                if (
                  isMaster ||
                  !sameAssetResource(displayUrl, SIGAPRO_OFFICIAL_LOGO)
                ) {
                  writeSessionLogo(context, displayUrl);
                }
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
              if (
                isMaster ||
                !sameAssetResource(pendingUrl, SIGAPRO_OFFICIAL_LOGO)
              ) {
                writeSessionLogo(context, pendingUrl);
                setLoadedSource({ context, url: pendingUrl });
              }
            }}
            onError={() => setFailedSources((current) => current.includes(pendingUrl) ? current : [...current, pendingUrl])}
          />
        ) : null}
      </div>
    </div>
  );
}
