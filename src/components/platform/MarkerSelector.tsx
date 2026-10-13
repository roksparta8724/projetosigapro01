import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Flag, Trash2, X } from "@/components/platform/PremiumIcons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseMarker } from "@/lib/platform";
import { MARKER_COLOR_OPTIONS, useMarkerPresets, formatMarkerLabel } from "@/hooks/useMarkerPresets";
import { usePlatformData } from "@/hooks/usePlatformData";

type MarkerSelectorProps = {
  processId: string;
  tags?: string[];
  actor: string;
  className?: string;
  triggerClassName?: string;
};

export function MarkerSelector({ processId, tags = [], actor, className, triggerClassName }: MarkerSelectorProps) {
  const { presets, addPreset, removePreset } = useMarkerPresets();
  const { addProcessMarkerWithColor, removeProcessMarker } = usePlatformData();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [flagPulse, setFlagPulse] = useState(false);
  const [savePulse, setSavePulse] = useState(false);
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

  const markers = useMemo(() => tags.map((tag) => ({ tag, ...parseMarker(tag) })), [tags]);
  const activePresets = useMemo(() => presets.filter((preset) => preset.active), [presets]);

  const handleAddPreset = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    addPreset({ label: trimmed, emoji: "", color, description: "Marcador personalizado do usuario." });
    setLabel("");
    setFlagPulse(true);
    setSavePulse(true);
    window.setTimeout(() => setFlagPulse(false), 600);
    window.setTimeout(() => setSavePulse(false), 520);
  };

  const handleApplyMarker = async (markerLabel: string, markerColor: string) => {
    if (markerBusy) return;
    setMarkerBusy(markerLabel);
    setActionError(null);
    try {
      await addProcessMarkerWithColor(processId, markerLabel, markerColor, actor);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível salvar o marcador.");
    } finally {
      setMarkerBusy(null);
    }
  };

  const handleRemoveMarker = async (markerTag: string) => {
    if (markerBusy) return;
    setMarkerBusy(markerTag);
    setActionError(null);
    try {
      await removeProcessMarker(processId, markerTag, actor);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível remover o marcador.");
    } finally {
      setMarkerBusy(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition hover:bg-white",
            triggerClassName,
          )}
        >
              <Flag
                className="h-4 w-4 sig-flag-glow-strong sig-flag-filled sig-flag-grad text-sky-500"
                style={{ color: "#38bdf8", fill: "#38bdf8" }}
              />
          <span>Marcadores</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={panelRef}
        data-marker-panel="true"
        side="bottom"
        align="end"
        sideOffset={10}
        collisionPadding={{ top: 84, right: 16, bottom: 16, left: 16 }}
        sticky="always"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        style={{ maxHeight: "min(680px, var(--radix-popover-content-available-height))" }}
        className={cn(
          "sig-marker-panel z-[100] w-[400px] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-[24px] border border-slate-200 bg-white p-0 text-slate-950 shadow-[0_30px_80px_rgba(15,23,42,0.24)]",
          className,
        )}
      >
        <div className="sig-marker-panel-head sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-sky-100 bg-sky-50 text-sky-600 shadow-sm">
                <Flag className="h-5 w-5 sig-flag-filled" style={{ fill: "currentColor" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Organização do processo</p>
                <p className="mt-1 text-[15px] font-bold leading-5 text-slate-950">Marcadores</p>
                <p className="mt-1 text-[12px] leading-5 text-slate-500">
                  Destaque prioridades sem sair da tela atual.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              aria-label="Fechar marcadores"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <section className="rounded-[18px] border border-slate-200 bg-slate-50 p-3.5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Neste processo</p>
                <p className="mt-1 text-[12px] font-medium text-slate-600">Marcadores já aplicados</p>
              </div>
              <span className="inline-flex min-w-7 items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700">
                {markers.length}
              </span>
            </div>
        {markers.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-slate-200/80 bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
            Nenhum marcador neste processo.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 py-2">
            {markers.map((marker) => (
              <span
                key={marker.tag}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1 text-[12px] font-semibold text-slate-700 shadow-sm"
                style={{ backgroundColor: `${marker.color}14` }}
                title={marker.label}
              >
                <span className="flex h-7 w-7 items-center justify-center">
                  <Flag
                    className="h-4 w-4 sig-flag-glow-strong sig-flag-filled sig-flag-grad"
                    style={{ color: marker.color || "#2563eb", fill: marker.color || "#2563eb" }}
                  />
                </span>
                {marker.label}
                <button
                  type="button"
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-700"
                  onClick={() => void handleRemoveMarker(marker.tag)}
                  disabled={Boolean(markerBusy)}
                  aria-label="Remover marcador"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
          </section>

        <section className="rounded-[18px] border border-slate-200 bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Marcadores disponíveis</p>
            <p className="mt-1 text-[12px] text-slate-500">Clique para aplicar ou atualizar um marcador.</p>
          </div>
          <div className="mt-2 grid gap-2">
            {activePresets.map((preset) => {
              const composedLabel = formatMarkerLabel(preset);
              const isApplied = markers.some((marker) => marker.label.toLowerCase() === composedLabel.toLowerCase());
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => void handleApplyMarker(composedLabel, preset.color)}
                  disabled={Boolean(markerBusy)}
                  aria-busy={markerBusy === composedLabel}
                  className={cn(
                    "flex min-h-[48px] items-center justify-between rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.05)] transition hover:-translate-y-px hover:border-sky-200 hover:bg-sky-50/60 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]",
                    isApplied && "border-emerald-200 bg-emerald-50 text-emerald-800",
                    markerBusy && "cursor-wait opacity-70",
                  )}
                  title={preset.label}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[10px] text-base shadow-inner">
                      <Flag
                        className="h-4 w-4 sig-flag-glow-strong sig-flag-filled sig-flag-grad"
                        style={{ color: preset.color || "#2563eb", fill: preset.color || "#2563eb" }}
                      />
                    </span>
                    <span className="font-medium">{preset.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {isApplied ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                        <Check className="h-3 w-3" />
                        Aplicado
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                        Aplicar
                      </span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removePreset(preset.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        event.stopPropagation();
                        removePreset(preset.id);
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Remover marcador"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {actionError ? (
          <div className="mt-3 rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
            {actionError}
          </div>
        ) : null}

        <section className="rounded-[18px] border border-slate-200 bg-slate-50 p-3.5">
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Criar marcador</p>
            <p className="mt-1 text-[12px] text-slate-500">Crie uma etiqueta personalizada para sua rotina.</p>
          </div>
          <div className="mt-2 grid grid-cols-[52px_minmax(0,1fr)] gap-2">
            <button
              type="button"
              aria-label="Ícone do marcador"
              className="flex h-11 w-[52px] items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <Flag
                className={cn(
                  "h-5 w-5 sig-flag-glow-strong sig-flag-filled sig-flag-grad",
                  flagPulse && "sig-flag-pulse",
                  savePulse && "sig-flag-pulse",
                )}
                style={{ color: color, fill: color }}
              />
            </button>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Nome do marcador"
              className="sig-marker-input h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Paleta de cores</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {MARKER_COLOR_OPTIONS.map((option) => {
                const isActive = option.value === color;
                return (
                  <button
                    key={`selector-${option.value}`}
                    type="button"
                    className={cn(
                      "sig-marker-swatch group rounded-[16px] border px-2.5 py-2 text-left transition",
                      isActive && "sig-marker-swatch-active",
                    )}
                    onClick={() => setColor(option.value)}
                    aria-label={`Selecionar ${option.label}`}
                    title={option.label}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-[10px] border shadow-[0_0_0_2px_rgba(255,255,255,0.06)]"
                        style={{ backgroundColor: `${option.value}16`, borderColor: `${option.value}38`, color: option.value }}
                      >
                        <Flag className="h-3.5 w-3.5" style={{ color: option.value, fill: option.value }} />
                      </span>
                      <span className="truncate text-[11px] font-medium">{option.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3">
            <Button
              type="button"
              className={cn(
                "sig-force-dark-action h-10 w-full rounded-xl bg-slate-950 !text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] hover:bg-slate-900",
                savePulse && "sig-flag-pulse",
              )}
              onClick={handleAddPreset}
              disabled={!label.trim()}
            >
              Salvar novo marcador
            </Button>
          </div>
        </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
