import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Flag, X } from "@/components/platform/PremiumIcons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { parseMarker } from "@/lib/platform";
import { useMarkerPresets, formatMarkerLabel } from "@/hooks/useMarkerPresets";
import { usePlatformData } from "@/hooks/usePlatformData";

type MarkerSelectorProps = {
  processId?: string;
  tags?: string[];
  actor: string;
  subjectLabel?: string;
  className?: string;
  triggerClassName?: string;
  showAppliedMarkers?: boolean;
  onApplyMarker?: (markerLabel: string, markerColor: string) => Promise<void> | void;
  onRemoveMarker?: (markerTag: string) => Promise<void> | void;
};

export function MarkerSelector({
  processId,
  tags = [],
  actor,
  subjectLabel = "processo",
  className,
  triggerClassName,
  showAppliedMarkers = true,
  onApplyMarker,
  onRemoveMarker,
}: MarkerSelectorProps) {
  const { presets } = useMarkerPresets();
  const { addProcessMarkerWithColor, removeProcessMarker } = usePlatformData();
  const [open, setOpen] = useState(false);
  const [markerBusy, setMarkerBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const markers = useMemo(
    () => tags.map((tag) => ({ tag, ...parseMarker(tag) })),
    [tags],
  );
  const activePresets = useMemo(
    () => presets.filter((preset) => preset.active),
    [presets],
  );

  const handleApplyMarker = async (markerLabel: string, markerColor: string) => {
    if (markerBusy) return;
    setMarkerBusy(markerLabel);
    setActionError(null);

    try {
      if (onApplyMarker) {
        await onApplyMarker(markerLabel, markerColor);
      } else if (processId) {
        await addProcessMarkerWithColor(processId, markerLabel, markerColor, actor);
      } else {
        throw new Error("Este item não possui destino configurado para marcador.");
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível aplicar o marcador.");
    } finally {
      setMarkerBusy(null);
    }
  };

  const handleRemoveMarker = async (markerTag: string) => {
    if (markerBusy) return;
    setMarkerBusy(markerTag);
    setActionError(null);

    try {
      if (onRemoveMarker) {
        await onRemoveMarker(markerTag);
      } else if (processId) {
        await removeProcessMarker(processId, markerTag, actor);
      } else {
        throw new Error("Este item não possui destino configurado para marcador.");
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível remover o marcador.");
    } finally {
      setMarkerBusy(null);
    }
  };

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {showAppliedMarkers && markers.slice(0, 2).map((marker) => (
        <span
          key={marker.tag}
          className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none shadow-sm"
          style={{
            borderColor: `${marker.color}66`,
            backgroundColor: `${marker.color}18`,
            color: marker.color,
          }}
          title={marker.label}
        >
          <Flag
            className="h-3.5 w-3.5 shrink-0 sig-flag-filled"
            style={{ color: marker.color, fill: marker.color }}
          />
          <span className="truncate">{marker.label}</span>
        </span>
      ))}

      {showAppliedMarkers && markers.length > 2 ? (
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-2 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          +{markers.length - 2}
        </span>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/40",
              markers.length > 0 && "border-sky-200 bg-sky-50/70 text-sky-800",
              triggerClassName,
            )}
          >
            <Flag className="h-3.5 w-3.5 shrink-0" />
            <span>{markers.length > 0 ? "Alterar marcador" : "Adicionar marcador"}</span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          ref={panelRef}
          data-marker-panel="true"
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={{ top: 84, right: 16, bottom: 16, left: 16 }}
          sticky="always"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          style={{ maxHeight: "min(620px, var(--radix-popover-content-available-height))" }}
          className="sig-marker-panel z-[100] w-[380px] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-[22px] border border-slate-200 bg-white p-0 text-slate-950 shadow-[0_28px_70px_rgba(15,23,42,0.22)]"
        >
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-sky-100 bg-sky-50 text-sky-600">
                  <Flag className="h-4 w-4 sig-flag-filled" style={{ fill: "currentColor" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Marcadores
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    Organizar {subjectLabel}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-500">
                    Use os marcadores criados no ícone de Marcadores da barra superior.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Fechar marcadores"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4 p-4">
            {markers.length > 0 ? (
              <section className="rounded-[16px] border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Aplicados
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {markers.map((marker) => (
                    <span
                      key={marker.tag}
                      className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-bold"
                      style={{
                        borderColor: `${marker.color}66`,
                        backgroundColor: `${marker.color}18`,
                        color: marker.color,
                      }}
                    >
                      <Flag className="h-3.5 w-3.5 sig-flag-filled" style={{ fill: marker.color }} />
                      {marker.label}
                      <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/80"
                        onClick={() => void handleRemoveMarker(marker.tag)}
                        disabled={Boolean(markerBusy)}
                        aria-label={`Remover marcador ${marker.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-[16px] border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Disponíveis
                  </p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    Clique para aplicar neste {subjectLabel}.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                  {activePresets.length}
                </span>
              </div>

              {activePresets.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-[12px] leading-5 text-slate-500">
                  Nenhum marcador ativo. Crie ou ative marcadores no ícone da barra superior.
                </div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {activePresets.map((preset) => {
                    const composedLabel = formatMarkerLabel(preset);
                    const isApplied = markers.some(
                      (marker) => marker.label.toLowerCase() === composedLabel.toLowerCase(),
                    );

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => void handleApplyMarker(composedLabel, preset.color || "#2563eb")}
                        disabled={Boolean(markerBusy) || isApplied}
                        className={cn(
                          "flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-left transition",
                          isApplied
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50/70",
                          markerBusy && "cursor-wait opacity-70",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border"
                            style={{
                              borderColor: `${preset.color || "#2563eb"}55`,
                              backgroundColor: `${preset.color || "#2563eb"}14`,
                            }}
                          >
                            <Flag
                              className="h-3.5 w-3.5 sig-flag-filled"
                              style={{
                                color: preset.color || "#2563eb",
                                fill: preset.color || "#2563eb",
                              }}
                            />
                          </span>
                          <span className="truncate text-[12px] font-semibold">{preset.label}</span>
                        </span>
                        {isApplied ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                            <Check className="h-3 w-3" />
                            Aplicado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                            Aplicar
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {actionError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
                {actionError}
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
