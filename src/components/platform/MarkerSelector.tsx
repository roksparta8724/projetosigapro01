import { useMemo, useState } from "react";
import { Check, Flag, PencilLine, Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseMarker } from "@/lib/platform";
import { useMarkerPresets, formatMarkerLabel } from "@/hooks/useMarkerPresets";
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
  const [color, setColor] = useState("#3b82f6");
  const [flagPulse, setFlagPulse] = useState(false);
  const [savePulse, setSavePulse] = useState(false);

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

  const handleApplyMarker = (markerLabel: string, markerColor: string) => {
    addProcessMarkerWithColor(processId, markerLabel, markerColor, actor);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-full border border-slate-200/70 bg-white/90 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.12)] transition hover:bg-white",
            triggerClassName,
          )}
        >
          <Flag
            className="h-4 w-4 sig-flag-glow-strong sig-flag-filled sig-flag-grad text-sky-500"
            style={{ fill: "#38bdf8" }}
          />
          <span>Marcadores</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          "sig-marker-panel w-[360px] rounded-[22px] border border-slate-200/60 bg-white/95 p-4 shadow-[0_28px_60px_rgba(15,23,42,0.22)]",
          className,
        )}
      >
        <DropdownMenuLabel className="px-1 py-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Marcadores</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">Acesso rapido aos seus processos marcados</p>
          <p className="mt-1 text-xs text-slate-500">Organize prioridades com etiquetas visuais.</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-3" />
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
                    style={{ color: marker.color || "#3b82f6", fill: marker.color || "#3b82f6" }}
                  />
                </span>
                {marker.label}
                <button
                  type="button"
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-700"
                  onClick={() => removeProcessMarker(processId, marker.tag, actor)}
                  aria-label="Remover marcador"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-[16px] border border-slate-200/80 bg-slate-50/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Marcadores ativos</p>
          <div className="mt-2 grid gap-2">
            {activePresets.map((preset) => {
              const composedLabel = formatMarkerLabel(preset);
              const isApplied = markers.some((marker) => marker.label.toLowerCase() === composedLabel.toLowerCase());
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyMarker(composedLabel, preset.color)}
                  className={cn(
                    "flex items-center justify-between rounded-[14px] border border-slate-200/80 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50",
                    isApplied && "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                  title={preset.label}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[10px] text-base shadow-inner">
                      <Flag
                        className="h-4 w-4 sig-flag-glow-strong sig-flag-filled sig-flag-grad"
                        style={{ color: preset.color || "#3b82f6", fill: preset.color || "#3b82f6" }}
                      />
                    </span>
                    <span className="font-medium">{preset.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.color }} />
                    {isApplied ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4 text-slate-400" />}
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
        </div>

        <div className="mt-3 rounded-[16px] border border-slate-200/80 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Criar marcador</p>
          <div className="mt-2 grid grid-cols-[52px_minmax(0,1fr)_64px] gap-2">
            <button
              type="button"
              aria-label="Bandeira do marcador"
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
              className="h-11 rounded-xl"
            />
            <Input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-11 w-full rounded-xl p-1"
            />
          </div>
          <div className="mt-2 flex items-center justify-start">
            <Button
              type="button"
              variant="outline"
              className={cn("h-9 rounded-full text-[12px]", savePulse && "sig-flag-pulse")}
              onClick={handleAddPreset}
            >
              Salvar marcador
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
