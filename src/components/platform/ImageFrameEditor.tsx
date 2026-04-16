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
  frameClassName?: string;
  viewportClassName?: string;
  wrapperClassName?: string;
  label?: string;
  hint?: string;
  wheelZoomRequiresModifier?: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampOffsets(
  nextScale: number,
  nextOffsetX: number,
  nextOffsetY: number,
  frameWidth: number,
  frameHeight: number,
  naturalWidth: number,
  naturalHeight: number,
) {
  const safeScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  const baseScale = Math.min(frameWidth / naturalWidth, frameHeight / naturalHeight) || 1;
  const renderScale = baseScale * safeScale;
  const width = naturalWidth * renderScale;
  const height = naturalHeight * renderScale;
  const maxOffsetX = Math.max((width - frameWidth) / 2, 0);
  const maxOffsetY = Math.max((height - frameHeight) / 2, 0);

  return {
    scale: safeScale,
    offsetX: clamp(nextOffsetX, -maxOffsetX, maxOffsetX),
    offsetY: clamp(nextOffsetY, -maxOffsetY, maxOffsetY),
  };
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 3.5;
const DEFAULT_SCALE = 1;

export function ImageFrameEditor({
  imageUrl,
  scale,
  offsetX,
  offsetY,
  onChange,
  frameClassName,
  viewportClassName,
  wrapperClassName,
  label = "Ajuste visual",
  hint = "Arraste para reposicionar. Use os botões de zoom ou Ctrl + rolagem para aproximar ou afastar.",
  wheelZoomRequiresModifier = true,
}: ImageFrameEditorProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number; pointerId?: number } | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });

  const isRenderableUrl = (value?: string | null) => {
    if (!value) return false;
    return /^https?:\/\//i.test(value) || value.startsWith("blob:") || value.startsWith("data:");
  };

  const [stableImageUrl, setStableImageUrl] = useState<string>(imageUrl);

  useEffect(() => {
    if (isRenderableUrl(imageUrl)) {
      setStableImageUrl(imageUrl);
    }
  }, [imageUrl]);

  useEffect(() => {
    if (!stableImageUrl) return;
    const image = new window.Image();
    image.onload = () => {
      setNaturalSize({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });
    };
    image.src = stableImageUrl;
  }, [stableImageUrl]);

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

  const metrics = useMemo(() => {
    const baseScale = Math.min(frameSize.width / naturalSize.width, frameSize.height / naturalSize.height) || 1;
    const renderScale = baseScale * clamp(scale, MIN_SCALE, MAX_SCALE);
    const width = naturalSize.width * renderScale;
    const height = naturalSize.height * renderScale;
    const maxOffsetX = Math.max((width - frameSize.width) / 2, 0);
    const maxOffsetY = Math.max((height - frameSize.height) / 2, 0);
    return {
      baseScale,
      renderScale,
      width,
      height,
      maxOffsetX,
      maxOffsetY,
    };
  }, [frameSize.height, frameSize.width, naturalSize.height, naturalSize.width, scale]);

  useEffect(() => {
    if (!frameSize.width || !frameSize.height) return;
    const nextOffsetX = clamp(offsetX, -metrics.maxOffsetX, metrics.maxOffsetX);
    const nextOffsetY = clamp(offsetY, -metrics.maxOffsetY, metrics.maxOffsetY);
    if (nextOffsetX !== offsetX || nextOffsetY !== offsetY) {
      onChange({
        scale: clamp(scale, MIN_SCALE, MAX_SCALE),
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
      });
    }
  }, [frameSize.height, frameSize.width, metrics.maxOffsetX, metrics.maxOffsetY, offsetX, offsetY, onChange, scale]);

  const updateScale = (nextScale: number, focalPoint?: { x: number; y: number }) => {
    if (!frameSize.width || !frameSize.height) return;

    if (!focalPoint) {
      const clamped = clampOffsets(
        nextScale,
        offsetX,
        offsetY,
        frameSize.width,
        frameSize.height,
        naturalSize.width,
        naturalSize.height,
      );
      onChange(clamped);
      return;
    }

    const targetScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const ratio = targetScale / clamp(scale, MIN_SCALE, MAX_SCALE);
    const centeredX = focalPoint.x - frameSize.width / 2;
    const centeredY = focalPoint.y - frameSize.height / 2;
    const nextOffsetX = centeredX - (centeredX - offsetX) * ratio;
    const nextOffsetY = centeredY - (centeredY - offsetY) * ratio;

    onChange(
      clampOffsets(
        targetScale,
        nextOffsetX,
        nextOffsetY,
        frameSize.width,
        frameSize.height,
        naturalSize.width,
        naturalSize.height,
      ),
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
    const delta = event.deltaY > 0 ? -0.06 : 0.06;
    const rect = event.currentTarget.getBoundingClientRect();
    updateScale(Number((scale + delta).toFixed(2)), {
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
            onClick={() => updateScale(scale - 0.1)}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900/70"
            onClick={() => updateScale(scale + 0.1)}
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
                scale: DEFAULT_SCALE,
                offsetX: 0,
                offsetY: 0,
              })
            }
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={cn("mt-4 flex justify-center", frameClassName)}>
        <div className="relative rounded-[34px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#edf4fb_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-slate-700/70 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.75)_0%,rgba(2,6,23,0.9)_100%)]">
          <div className="pointer-events-none absolute inset-[12px] rounded-[26px] border border-white/80 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] dark:border-white/10" />
          <div
            ref={frameRef}
            className={cn(
              "relative h-[180px] w-[180px] cursor-grab overflow-hidden rounded-[26px] bg-white shadow-[0_14px_30px_rgba(15,23,42,0.16)] active:cursor-grabbing dark:bg-slate-50",
              viewportClassName,
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_48%,rgba(15,23,42,0.08)_100%)]" />
            {stableImageUrl && isRenderableUrl(stableImageUrl) ? (
              <img
                src={stableImageUrl}
                alt="Preview"
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: `${metrics.width}px`,
                  height: `${metrics.height}px`,
                  transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
                  transformOrigin: "center",
                }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                <ImageIcon className="h-6 w-6 text-slate-400/80" />
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Preview</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
        <p className="text-sm text-slate-600 dark:text-slate-200">
          Zoom atual: <span className="font-semibold text-slate-950 dark:text-slate-100">{scale.toFixed(2)}x</span>
        </p>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          {wheelZoomRequiresModifier ? "Arraste + Ctrl Scroll" : "Arraste + Scroll"}
        </p>
      </div>
    </div>
  );
}
