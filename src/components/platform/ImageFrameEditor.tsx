import { Image as ImageIcon, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageFrameEditorProps {
  imageUrl: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  onChange: (next: { scale: number; offsetX: number; offsetY: number }) => void;
  onMetricsChange?: (next: {
    frameWidth: number;
    frameHeight: number;
    naturalWidth: number;
    naturalHeight: number;
    baseScale: number;
    minScale: number;
    maxScale: number;
  }) => void;
  frameClassName?: string;
  viewportClassName?: string;
  wrapperClassName?: string;
  label?: string;
  hint?: string;
  wheelZoomRequiresModifier?: boolean;
  fitMode?: "contain" | "cover";
  shape?: "rounded" | "circle";
  minScale?: number;
  maxScale?: number;
  zoomStep?: number;
  darkLogoPreview?: boolean;
}

const DEFAULT_MIN_SCALE = 0.35;
const DEFAULT_MAX_SCALE = 3.5;
const DEFAULT_SCALE = 1;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isRenderableUrl(value?: string | null) {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return (
    /^https?:\/\//i.test(normalized) ||
    normalized.startsWith("//") ||
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    normalized.startsWith("blob:") ||
    normalized.startsWith("data:")
  );
}

function resolveBaseScale(
  fitMode: "contain" | "cover",
  frameWidth: number,
  frameHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  shape: "rounded" | "circle" = "rounded",
) {
  if (!frameWidth || !frameHeight || !naturalWidth || !naturalHeight) return 1;

  if (fitMode === "cover") {
    return Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight) || 1;
  }

  if (shape === "circle") {
    // A rectangular bitmap only fits completely inside a circle when its
    // diagonal stays inside the circle diameter. This prevents the circle mask
    // from cutting any edge/corner of the uploaded photo or logo.
    const diameter = Math.min(frameWidth, frameHeight);
    const imageDiagonal = Math.hypot(naturalWidth, naturalHeight);
    return imageDiagonal > 0 ? (diameter * 0.96) / imageDiagonal : 1;
  }

  return Math.min(frameWidth / naturalWidth, frameHeight / naturalHeight) || 1;
}

function clampOffsets(input: {
  nextScale: number;
  nextOffsetX: number;
  nextOffsetY: number;
  frameWidth: number;
  frameHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  fitMode: "contain" | "cover";
  shape: "rounded" | "circle";
  minScale: number;
  maxScale: number;
}) {
  const safeScale = clamp(input.nextScale, input.minScale, input.maxScale);
  const baseScale = resolveBaseScale(
    input.fitMode,
    input.frameWidth,
    input.frameHeight,
    input.naturalWidth,
    input.naturalHeight,
    input.shape,
  );
  const renderScale = baseScale * safeScale;
  const width = input.naturalWidth * renderScale;
  const height = input.naturalHeight * renderScale;
  const maxOffsetX = Math.max((width - input.frameWidth) / 2, 0);
  const maxOffsetY = Math.max((height - input.frameHeight) / 2, 0);

  return {
    scale: safeScale,
    offsetX: clamp(input.nextOffsetX, -maxOffsetX, maxOffsetX),
    offsetY: clamp(input.nextOffsetY, -maxOffsetY, maxOffsetY),
  };
}

export function ImageFrameEditor({
  imageUrl,
  scale,
  offsetX,
  offsetY,
  onChange,
  onMetricsChange,
  frameClassName,
  viewportClassName,
  wrapperClassName,
  label = "Ajuste visual",
  hint = "Arraste para reposicionar. Use os controles de zoom para aproximar ou afastar com precisão.",
  wheelZoomRequiresModifier = true,
  fitMode = "contain",
  shape = "rounded",
  minScale,
  maxScale,
  zoomStep = 0.1,
  darkLogoPreview = false,
}: ImageFrameEditorProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number; pointerId?: number } | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [stableImageUrl, setStableImageUrl] = useState<string>(() => isRenderableUrl(imageUrl) ? imageUrl : "");

  const effectiveMinScale = fitMode === "cover" ? Math.max(minScale ?? 1, 1) : minScale ?? DEFAULT_MIN_SCALE;
  const effectiveMaxScale = Math.max(maxScale ?? DEFAULT_MAX_SCALE, effectiveMinScale + 0.1);

  // Stale-while-revalidate visual: never blank the editor while a renewed
  // signed URL or freshly uploaded blob is loading. Promote the new source
  // only after the browser has decoded it, preserving both image and metrics.
  useEffect(() => {
    if (!isRenderableUrl(imageUrl) || imageUrl === stableImageUrl) return;

    let cancelled = false;
    const nextImage = new window.Image();
    nextImage.decoding = "async";

    const promote = async () => {
      try {
        await nextImage.decode();
      } catch {
        // onload already confirms the bitmap can be used.
      }
      if (cancelled) return;
      setNaturalSize({
        width: nextImage.naturalWidth || 1,
        height: nextImage.naturalHeight || 1,
      });
      setStableImageUrl(imageUrl);
    };

    nextImage.onload = () => {
      void promote();
    };
    nextImage.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl, stableImageUrl]);

  useEffect(() => {
    if (!stableImageUrl || naturalSize.width > 0 || naturalSize.height > 0) return;

    let cancelled = false;
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      setNaturalSize({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });
    };
    image.src = stableImageUrl;

    return () => {
      cancelled = true;
    };
  }, [naturalSize.height, naturalSize.width, stableImageUrl]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setFrameSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cropFrameSize = useMemo(
    () => ({
      width: shape === "circle" ? frameSize.width * 0.84 : frameSize.width,
      height: shape === "circle" ? frameSize.height * 0.84 : frameSize.height,
    }),
    [frameSize.height, frameSize.width, shape],
  );

  const metrics = useMemo(() => {
    const baseScale = resolveBaseScale(
      fitMode,
      cropFrameSize.width,
      cropFrameSize.height,
      naturalSize.width,
      naturalSize.height,
      shape,
    );
    const safeScale = clamp(scale, effectiveMinScale, effectiveMaxScale);
    const baseWidth = naturalSize.width * baseScale;
    const baseHeight = naturalSize.height * baseScale;
    const width = baseWidth * safeScale;
    const height = baseHeight * safeScale;
    const maxOffsetX = Math.max((width - cropFrameSize.width) / 2, 0);
    const maxOffsetY = Math.max((height - cropFrameSize.height) / 2, 0);

    return {
      baseScale,
      baseWidth,
      baseHeight,
      width,
      height,
      maxOffsetX,
      maxOffsetY,
      safeScale,
    };
  }, [
    effectiveMaxScale,
    effectiveMinScale,
    fitMode,
    cropFrameSize.height,
    cropFrameSize.width,
    naturalSize.height,
    naturalSize.width,
    scale,
    shape,
  ]);

  useEffect(() => {
    if (!cropFrameSize.width || !cropFrameSize.height) return;
    const nextOffsetX = clamp(offsetX, -metrics.maxOffsetX, metrics.maxOffsetX);
    const nextOffsetY = clamp(offsetY, -metrics.maxOffsetY, metrics.maxOffsetY);
    const nextScale = clamp(scale, effectiveMinScale, effectiveMaxScale);

    if (nextOffsetX !== offsetX || nextOffsetY !== offsetY || nextScale !== scale) {
      onChange({
        scale: nextScale,
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
      });
    }
  }, [
    effectiveMaxScale,
    effectiveMinScale,
    cropFrameSize.height,
    cropFrameSize.width,
    metrics.maxOffsetX,
    metrics.maxOffsetY,
    offsetX,
    offsetY,
    onChange,
    scale,
  ]);

  useEffect(() => {
    if (!onMetricsChange || !cropFrameSize.width || !cropFrameSize.height || !naturalSize.width || !naturalSize.height) return;
    onMetricsChange({
      frameWidth: cropFrameSize.width,
      frameHeight: cropFrameSize.height,
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
      baseScale: metrics.baseScale,
      minScale: effectiveMinScale,
      maxScale: effectiveMaxScale,
    });
  }, [
    effectiveMaxScale,
    effectiveMinScale,
    cropFrameSize.height,
    cropFrameSize.width,
    metrics.baseScale,
    naturalSize.height,
    naturalSize.width,
    onMetricsChange,
  ]);

  const updateScale = (nextScale: number, focalPoint?: { x: number; y: number }) => {
    if (!cropFrameSize.width || !cropFrameSize.height) return;

    if (!focalPoint) {
      onChange(
        clampOffsets({
          nextScale,
          nextOffsetX: offsetX,
          nextOffsetY: offsetY,
          frameWidth: cropFrameSize.width,
          frameHeight: cropFrameSize.height,
          naturalWidth: naturalSize.width,
          naturalHeight: naturalSize.height,
          fitMode,
          shape,
          minScale: effectiveMinScale,
          maxScale: effectiveMaxScale,
        }),
      );
      return;
    }

    const targetScale = clamp(nextScale, effectiveMinScale, effectiveMaxScale);
    const ratio = targetScale / clamp(scale, effectiveMinScale, effectiveMaxScale);
    const centeredX = focalPoint.x - frameSize.width / 2;
    const centeredY = focalPoint.y - frameSize.height / 2;
    const nextOffsetX = centeredX - (centeredX - offsetX) * ratio;
    const nextOffsetY = centeredY - (centeredY - offsetY) * ratio;

    onChange(
      clampOffsets({
        nextScale: targetScale,
        nextOffsetX,
        nextOffsetY,
        frameWidth: frameSize.width,
        frameHeight: frameSize.height,
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        fitMode,
        shape,
        minScale: effectiveMinScale,
        maxScale: effectiveMaxScale,
      }),
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX,
      offsetY,
      pointerId: event.pointerId,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    onChange({
      scale,
      offsetX: clamp(current.offsetX + deltaX, -metrics.maxOffsetX, metrics.maxOffsetX),
      offsetY: clamp(current.offsetY + deltaY, -metrics.maxOffsetY, metrics.maxOffsetY),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (wheelZoomRequiresModifier && !event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY > 0 ? -zoomStep : zoomStep;
    const rect = event.currentTarget.getBoundingClientRect();
    updateScale(Number((scale + delta).toFixed(3)), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  return (
    <div className={cn("rounded-[24px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/50", wrapperClassName)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">{label}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-300">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900/70"
            onClick={() => updateScale(scale - zoomStep)}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900/70"
            onClick={() => updateScale(scale + zoomStep)}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900/70"
            onClick={() =>
              onChange({
                scale: clamp(DEFAULT_SCALE, effectiveMinScale, effectiveMaxScale),
                offsetX: 0,
                offsetY: 0,
              })
            }
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {shape === "circle" && naturalSize.width > 0 && naturalSize.height > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          <span>Recorte final circular • proporção preservada</span>
          <span>{naturalSize.width} × {naturalSize.height}px</span>
        </div>
      ) : null}

      <div className={cn("mt-4 flex justify-center", frameClassName)}>
        <div
          data-image-frame-shape={shape}
          className={cn(
            "relative",
            shape === "circle"
              ? "flex w-full items-center justify-center bg-transparent p-0"
              : "rounded-[34px]",
            shape !== "circle" && (
              darkLogoPreview
                ? "bg-transparent"
                : "border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#edf4fb_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-slate-700/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.75)_0%,rgba(2,6,23,0.9)_100%)]"
            ),
          )}
        >
          {!darkLogoPreview && shape !== "circle" ? (
            <div className="pointer-events-none absolute inset-[12px] rounded-[26px] border border-white/80 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] dark:border-white/10" />
          ) : null}
          <div
            ref={frameRef}
            data-image-frame-viewport="true"
            className={cn(
              "relative cursor-grab overflow-hidden active:cursor-grabbing",
              shape === "circle"
                ? "sig-image-frame-stage shrink-0 rounded-[28px] border border-slate-700/70 bg-slate-950/20 shadow-[0_18px_42px_rgba(2,6,23,0.2)]"
                : "h-[180px] w-[180px] rounded-[26px]",
              shape !== "circle" && (darkLogoPreview ? "bg-slate-950" : "bg-white shadow-[0_14px_30px_rgba(15,23,42,0.16)] dark:bg-slate-50"),
              viewportClassName,
            )}
            style={
              shape === "circle"
                ? {
                    width: "min(360px, 100%)",
                    height: "auto",
                    aspectRatio: "1 / 1",
                    flex: "0 0 auto",
                  }
                : undefined
            }
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            {shape !== "circle" ? (
              <>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_52%,rgba(15,23,42,0.08)_100%)]" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.05)_0%,transparent_18%,transparent_82%,rgba(15,23,42,0.05)_100%)]" />
              </>
            ) : null}
            {stableImageUrl && isRenderableUrl(stableImageUrl) && naturalSize.width > 0 && naturalSize.height > 0 ? (
              <>
                {shape === "circle" ? (
                  <>
                    <img
                      src={stableImageUrl}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="sig-image-frame-background pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-center opacity-45"
                    />
                    <div className="sig-image-frame-final-surface pointer-events-none absolute inset-[8%] z-[1] rounded-full bg-white" />
                  </>
                ) : null}
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 z-[2]"
                style={{
                  transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`,
                  transformOrigin: "center",
                }}
              >
                <img
                  src={stableImageUrl}
                  alt="Preview"
                  draggable={false}
                  className={cn("block max-w-none select-none will-change-transform", darkLogoPreview && "mix-blend-screen")}
                  style={{
                    width: `${metrics.baseWidth}px`,
                    height: `${metrics.baseHeight}px`,
                    transform: `scale(${metrics.safeScale})`,
                    transformOrigin: "center center",
                  }}
                />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                <ImageIcon className="h-6 w-6 text-slate-400/80" />
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Preview</span>
              </div>
            )}

            {shape === "circle" ? (
              <div
                className="pointer-events-none absolute inset-[8%] z-20 rounded-full border-2 border-white/95"
                style={{
                  boxShadow:
                    "0 0 0 999px rgba(2, 6, 23, 0.58), 0 0 0 1px rgba(15, 23, 42, 0.28), 0 12px 32px rgba(2, 6, 23, 0.22)",
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="text-sm text-slate-600 dark:text-slate-200">
            Zoom atual: <span className="font-semibold text-slate-950 dark:text-slate-100">{clamp(scale, effectiveMinScale, effectiveMaxScale).toFixed(2)}x</span>
          </p>
          {naturalSize.width > 0 && naturalSize.height > 0 ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Original: <span className="font-medium text-slate-700 dark:text-slate-200">{naturalSize.width} × {naturalSize.height}px</span>
              {" • "}proporção preservada
            </p>
          ) : null}
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          {wheelZoomRequiresModifier ? "Arraste + Ctrl Scroll" : "Arraste + Scroll"}
        </p>
      </div>

      <div className="mt-3">
        <input
          type="range"
          min={effectiveMinScale}
          max={effectiveMaxScale}
          step={0.01}
          value={clamp(scale, effectiveMinScale, effectiveMaxScale)}
          aria-label="Controle de zoom"
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-950 dark:bg-slate-800 dark:accent-slate-100"
          onChange={(event) => updateScale(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
