import { useEffect, useMemo, useRef, useState } from "react";
import { resolveAssetUrl } from "@/lib/assetUrl";
import { cn } from "@/lib/utils";
import type { InstitutionalBranding } from "@/lib/institutionBranding";

interface InstitutionalLogoProps {
  branding: InstitutionalBranding;
  fallbackLabel?: string;
  variant?: "header" | "footer" | "preview" | "compact" | "login";
  className?: string;
  viewportClassName?: string;
}

const variantClasses = {
  header: {
    frame: "h-[112px] w-[188px] rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.08)_100%)] p-2 shadow-[0_18px_40px_rgba(2,6,23,0.18)] lg:h-[120px] lg:w-[204px]",
    viewport: "h-full w-full rounded-[18px] bg-white/98",
    placeholder: "text-[24px] lg:text-[26px]",
  },
  footer: {
    frame: "w-full max-w-[204px] rounded-[28px] border border-white/16 bg-white/96 p-4 shadow-[0_22px_46px_rgba(2,6,23,0.2)]",
    viewport: "h-[158px] w-full rounded-[18px] bg-white",
    placeholder: "text-[34px]",
  },
  preview: {
    frame: "w-full rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm",
    viewport: "h-[126px] w-full rounded-[18px] bg-white",
    placeholder: "text-[32px]",
  },
  compact: {
    frame: "h-[40px] w-[40px] rounded-[12px] border border-slate-200 bg-white p-1 shadow-[0_10px_20px_rgba(15,23,42,0.16)]",
    viewport: "h-full w-full rounded-[9px] bg-white",
    placeholder: "text-[13px]",
  },
  login: {
    frame: "h-full w-full rounded-[20px] border-0 bg-transparent p-0 shadow-none",
    viewport: "h-full w-full rounded-[20px] bg-white",
    placeholder: "text-[30px]",
  },
} as const;

function isRenderableUrl(value?: string | null) {
  return Boolean(resolveAssetUrl(value));
}

export function InstitutionalLogo({
  branding,
  fallbackLabel = "Prefeitura",
  variant = "header",
  className,
  viewportClassName,
}: InstitutionalLogoProps) {
  const classes = variantClasses[variant];
  const [imageFailed, setImageFailed] = useState(false);
  const [stableLogoUrl, setStableLogoUrl] = useState<string>(
    resolveAssetUrl(branding.logoUrl),
  );
  const contextKeyRef = useRef(`${variant}:${branding.tenantId || "global"}`);
  const lastResolvedUrlRef = useRef(stableLogoUrl);

  const initials = fallbackLabel
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SG";

  useEffect(() => {
    const nextContextKey = `${variant}:${branding.tenantId || "global"}`;
    const nextLogoUrl = resolveAssetUrl(branding.logoUrl);
    const sameContext = contextKeyRef.current === nextContextKey;

    contextKeyRef.current = nextContextKey;
    setImageFailed(false);

    if (sameContext) {
      if (nextLogoUrl) {
        lastResolvedUrlRef.current = nextLogoUrl;
        setStableLogoUrl(nextLogoUrl);
      } else if (lastResolvedUrlRef.current) {
        setStableLogoUrl(lastResolvedUrlRef.current);
      }
      return;
    }

    lastResolvedUrlRef.current = nextLogoUrl;
    setStableLogoUrl(nextLogoUrl);
  }, [branding.logoUrl, branding.tenantId, variant]);

  const imageStyle = useMemo<React.CSSProperties>(
    () => ({
      objectFit: branding.logoFitMode ?? "contain",
      transform: `translate(${branding.logoOffsetX || 0}px, ${branding.logoOffsetY || 0}px) scale(${branding.logoScale ?? 1})`,
      transformOrigin: "center center",
    }),
    [branding.logoFitMode, branding.logoOffsetX, branding.logoOffsetY, branding.logoScale],
  );

  const shouldRenderImage = Boolean(stableLogoUrl) && !imageFailed;

  return (
    <div className={cn("flex items-center justify-center", classes.frame, className)}>
      <div
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden",
          branding.logoFrameMode === "rounded" ? "rounded-[26px]" : classes.viewport,
          viewportClassName,
        )}
      >
        {shouldRenderImage ? (
          <img
            src={stableLogoUrl}
            alt={branding.logoAlt || fallbackLabel}
            className="pointer-events-none absolute inset-0 h-full w-full select-none"
            loading="eager"
            decoding="sync"
            fetchPriority="high"
            onError={() => {
              setImageFailed(true);
            }}
            style={imageStyle}
          />
        ) : (
          <div className={cn("flex h-full w-full items-center justify-center font-extrabold text-[#0F2A44]", classes.placeholder)}>
            {initials}
          </div>
        )}
      </div>
    </div>
  );
}
