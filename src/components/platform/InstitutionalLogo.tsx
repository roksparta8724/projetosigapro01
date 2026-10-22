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
  header: "h-[112px] w-[188px] p-0 lg:h-[120px] lg:w-[204px]",
  footer: "h-[188px] w-[188px] p-0",
  preview: "h-[140px] w-full max-w-[204px] p-0",
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
    const parsed = new URL(
      value,
      typeof window !== "undefined"
        ? window.location.origin
        : "https://sigapromunicipal.com.br",
    );

    // Na rota estável do brasão/logo municipal, o objectKey identifica o
    // arquivo. Remover toda a query faria logos de Prefeituras diferentes
    // parecerem o mesmo recurso durante F5.
    if (parsed.pathname.endsWith("/api/municipality-logo-open")) {
      const objectKey = parsed.searchParams.get("objectKey") || "";
      return `${parsed.origin}${parsed.pathname}?objectKey=${objectKey}`;
    }

    // Em URL assinada do R2, a query muda apenas autenticação/expiração.
    // A identidade visual continua sendo origin + pathname.
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split("#")[0];
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
  // O cache é isolado por Prefeitura + variante. Uma imagem já validada nesse
  // mesmo contexto permanece como frame estável enquanto uma nova identidade é
  // pré-carregada. Isso evita trocar o logo por um arquivo novo/quebrado antes
  // de o navegador confirmar que ele realmente carregou.
  const cachedAtMountAllowed =
    isMaster ||
    !sameAssetResource(cachedAtMount, SIGAPRO_OFFICIAL_LOGO);

  const [loadedSource, setLoadedSource] = useState(() => ({
    context,
    url: cachedAtMount && cachedAtMountAllowed ? cachedAtMount : imageUrl,
  }));

  const loadedSourceAllowed =
    isMaster ||
    !sameAssetResource(loadedSource.url, SIGAPRO_OFFICIAL_LOGO);

  const stableLoadedUrl =
    loadedSource.context === context &&
    loadedSource.url &&
    loadedSourceAllowed &&
    !failedSources.includes(loadedSource.url)
      ? loadedSource.url
      : "";

  const cachedContextUrl = readSessionLogo(context);
  const cachedAllowed =
    isMaster ||
    !sameAssetResource(cachedContextUrl, SIGAPRO_OFFICIAL_LOGO);
  const safeCachedUrl =
    cachedContextUrl &&
    cachedAllowed &&
    !failedSources.includes(cachedContextUrl)
      ? cachedContextUrl
      : "";

  // Stale-while-revalidate visual:
  // 1) mantém a última imagem já válida do MESMO contexto municipal;
  // 2) em F5/hidratação reutiliza imediatamente a imagem validada da sessão;
  // 3) uma URL nova é pré-carregada de forma invisível e só substitui a atual
  //    depois de disparar onLoad;
  // 4) troca de tenant muda o contexto e impede reutilização entre Prefeituras;
  // 5) uma superfície municipal nunca aceita o logo SIGAPRO como cache/fallback.
  const displayUrl = stableLoadedUrl || safeCachedUrl || imageUrl;
  const pendingUrl =
    imageUrl &&
    imageUrl !== displayUrl
      ? imageUrl
      : "";

  // Pré-carregamento fora do DOM.
  // Antes existia uma segunda <img aria-hidden> dentro do cartão do logo.
  // As regras globais premium do logo usam !important em width/height/opacity
  // e conseguiam tornar essa imagem de pré-carga visível por um frame durante
  // navegação/F5. O navegador então mostrava o brasão gigante sobre a página.
  // Um Image() desacoplado do DOM mantém o stale-while-revalidate sem permitir
  // que qualquer CSS de layout atinja o recurso pendente.
  useEffect(() => {
    if (!pendingUrl || typeof window === "undefined") return;

    const pendingIsAuthoritative =
      isMaster ||
      Boolean(
        requestedUrl &&
        sameAssetResource(pendingUrl, requestedUrl),
      );

    // Se o branding oficial ainda está hidratando e o pendingUrl é somente o
    // brasão de fallback, mantenha o último logo estável. Não pré-carregue nem
    // promova esse fallback para a tela.
    if (!pendingIsAuthoritative) return;

    let active = true;
    let settled = false;
    const probe = new window.Image();

    const markLoaded = () => {
      if (!active || settled) return;
      settled = true;
      if (
        isMaster ||
        !sameAssetResource(pendingUrl, SIGAPRO_OFFICIAL_LOGO)
      ) {
        writeSessionLogo(context, pendingUrl);
        setLoadedSource({ context, url: pendingUrl });
      }
    };

    const markFailed = () => {
      if (!active || settled) return;
      settled = true;
      setFailedSources((current) =>
        current.includes(pendingUrl) ? current : [...current, pendingUrl],
      );
    };

    probe.decoding = "sync";
    probe.onload = markLoaded;
    probe.onerror = markFailed;
    probe.src = pendingUrl;

    // Recursos presentes no memory cache podem já estar completos no mesmo tick.
    if (probe.complete && probe.naturalWidth > 0) {
      window.queueMicrotask(markLoaded);
    }

    return () => {
      active = false;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [context, isMaster, pendingUrl, requestedUrl]);

  const configuredScale = Number.isFinite(branding.logoScale) ? branding.logoScale : 1;
  // Em logo municipal com object-fit contain, escala abaixo de 1 apenas cria
  // uma margem vazia excessiva. Valores legados menores que 1 sao normalizados
  // visualmente para 1; o editor continua podendo ampliar e reposicionar.
  const scale = isMaster
    ? Math.max(0.35, Math.min(5, configuredScale))
    : Math.max(1, Math.min(5, configuredScale));
  const frameSize = variant === "header" ? 128 : 144;
  const frameRatio = frameSize / 160;
  // Master uses its original 160px editor. Municipal editors use a 188px
  // frame, while displayed header/footer cards have different responsive
  // heights. Percent translations scale with the actual logo card in the page.
  const masterOffsetX = (branding.logoOffsetX || 0) * frameRatio;
  const masterOffsetY = (branding.logoOffsetY || 0) * frameRatio;
  const municipalOffsetX = ((branding.logoOffsetX || 0) / 188) * 100;
  const municipalOffsetY = ((branding.logoOffsetY || 0) / 188) * 100;
  const logoTranslation = isMaster
    ? `translate(${masterOffsetX}px, ${masterOffsetY}px)`
    : `translate(${municipalOffsetX}%, ${municipalOffsetY}%)`;
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
        background: "#ffffff",
        backgroundColor: "#ffffff",
        border: "none",
        boxShadow: "none",
        opacity: 1,
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        mixBlendMode: "normal",
      }}
    >
      <div
        className={cn("relative flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden", viewportClassName)}
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
              style={showCrop ? { transform: `${logoTranslation} scale(${scale})`, transformOrigin: "center center" } : undefined}
              loading="eager"
              decoding="sync"
              onLoad={() => {
                setLoadedSource({ context, url: displayUrl });
                const isAuthoritativeCurrentLogo =
                  isMaster ||
                  Boolean(
                    requestedUrl &&
                    sameAssetResource(displayUrl, requestedUrl),
                  );
                if (
                  isAuthoritativeCurrentLogo &&
                  (isMaster ||
                    !sameAssetResource(displayUrl, SIGAPRO_OFFICIAL_LOGO))
                ) {
                  // Só a imagem configurada entra no cache municipal. O brasão
                  // de fallback nunca substitui a identidade oficial usada no
                  // último frame estável.
                  writeSessionLogo(context, displayUrl);
                }
              }}
              onError={() => setFailedSources((current) => current.includes(displayUrl) ? current : [...current, displayUrl])}
            />
          ) : null}
        </div>

      </div>
    </div>
  );
}
