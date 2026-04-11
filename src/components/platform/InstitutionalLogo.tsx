import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { InstitutionalBranding } from "@/lib/institutionBranding";

interface InstitutionalLogoProps {
  branding: InstitutionalBranding;
  fallbackLabel?: string;
  variant?: "header" | "footer" | "preview";
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
} as const;

export function InstitutionalLogo({
  branding,
  fallbackLabel = "Prefeitura",
  variant = "header",
  className,
  viewportClassName,
}: InstitutionalLogoProps) {
  const classes = variantClasses[variant];
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [imageFailed, setImageFailed] = useState(false);
  const initials = fallbackLabel
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "SG";

  useEffect(() => {
    console.log("[LogoRender] Renderizando logo", {
      variant,
      logoUrl: branding.logoUrl,
    });
    if (!branding.logoUrl) {
      setImageFailed(false);
      return;
    }

    const image = new window.Image();
    image.onload = () => {
      setImageFailed(false);
      setNaturalSize({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });
    };
    image.onerror = () => {
      setImageFailed(true);
    };
    image.src = branding.logoUrl;
  }, [branding.logoUrl]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setViewportSize({
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const imageMetrics = useMemo(() => {
    const fitMode = branding.logoFitMode ?? "contain";
    const baseScale =
      fitMode === "cover"
        ? Math.max(viewportSize.width / naturalSize.width, viewportSize.height / naturalSize.height)
        : Math.min(viewportSize.width / naturalSize.width, viewportSize.height / naturalSize.height);
    const renderScale = baseScale * (branding.logoScale ?? 1);

    return {
      width: naturalSize.width * renderScale,
      height: naturalSize.height * renderScale,
    };
  }, [branding.logoFitMode, branding.logoScale, naturalSize.height, naturalSize.width, viewportSize.height, viewportSize.width]);

  return (
    <div className={cn("flex items-center justify-center", classes.frame, className)}>
      <div
        ref={viewportRef}
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden",
          branding.logoFrameMode === "rounded" ? "rounded-[26px]" : classes.viewport,
          viewportClassName,
        )}
      >
        {branding.logoUrl && !imageFailed ? (
          <img
            src={branding.logoUrl}
            alt={branding.logoAlt || fallbackLabel}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none transition-transform duration-200"
            onError={() => setImageFailed(true)}
            style={{
              width: `${imageMetrics.width}px`,
              height: `${imageMetrics.height}px`,
              transform: `translate(calc(-50% + ${branding.logoOffsetX}px), calc(-50% + ${branding.logoOffsetY}px))`,
            }}
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
