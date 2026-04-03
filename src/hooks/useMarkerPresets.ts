import { useEffect, useMemo, useState } from "react";

export type MarkerPreset = {
  id: string;
  label: string;
  emoji: string;
  color: string;
};

const STORAGE_KEY = "sigapro-marker-presets";

const DEFAULT_PRESETS: MarkerPreset[] = [
  { id: "favorito", label: "Favorito", emoji: "💎", color: "#22c55e" },
  { id: "prioridade", label: "Prioridade", emoji: "⭐", color: "#f59e0b" },
  { id: "pendencia", label: "Pendência", emoji: "⚠️", color: "#f97316" },
  { id: "retorno", label: "Retorno", emoji: "📌", color: "#ef4444" },
  { id: "analise", label: "Análise", emoji: "🧭", color: "#3b82f6" },
];

function safeParse(raw: string | null): MarkerPreset[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MarkerPreset[];
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.emoji === "string" &&
        typeof item.color === "string",
    );
  } catch {
    return null;
  }
}

export function formatMarkerLabel(preset: Pick<MarkerPreset, "label" | "emoji">) {
  const emoji = preset.emoji.trim();
  const label = preset.label.trim();
  return [emoji, label].filter(Boolean).join(" ").trim();
}

export function useMarkerPresets() {
  const [presets, setPresets] = useState<MarkerPreset[]>(() => {
    if (typeof window === "undefined") return DEFAULT_PRESETS;
    const stored = safeParse(window.localStorage.getItem(STORAGE_KEY));
    return stored && stored.length > 0 ? stored : DEFAULT_PRESETS;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  const presetMap = useMemo(() => {
    const map = new Map<string, MarkerPreset>();
    presets.forEach((preset) => map.set(preset.id, preset));
    return map;
  }, [presets]);

  const addPreset = (preset: Omit<MarkerPreset, "id">) => {
    const label = preset.label.trim();
    if (!label) return;
    const id = `${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    setPresets((current) => [{ ...preset, id }, ...current]);
  };

  const removePreset = (id: string) => {
    setPresets((current) => current.filter((item) => item.id !== id));
  };

  return { presets, presetMap, addPreset, removePreset };
}
