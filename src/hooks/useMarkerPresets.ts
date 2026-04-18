import { useEffect, useMemo, useState } from "react";

export type MarkerPreset = {
  id: string;
  label: string;
  emoji: string;
  color: string;
  description: string;
  active: boolean;
  system: boolean;
};

export type NewMarkerPreset = {
  label: string;
  emoji?: string;
  color: string;
  description?: string;
  active?: boolean;
  system?: boolean;
};

export const SYSTEM_MARKER_IDS = new Set(["favorito", "prioridade", "pendencia", "retorno", "analise"]);

const STORAGE_KEY = "sigapro-marker-presets";

const DEFAULT_PRESETS: MarkerPreset[] = [
  {
    id: "favorito",
    label: "Favorito",
    emoji: "",
    color: "#22c55e",
    description: "Destaque para protocolos acompanhados de perto pela operacao.",
    active: true,
    system: true,
  },
  {
    id: "prioridade",
    label: "Prioridade",
    emoji: "",
    color: "#f59e0b",
    description: "Sinaliza processos que pedem tratativa preferencial na fila.",
    active: true,
    system: true,
  },
  {
    id: "pendencia",
    label: "Pendencia",
    emoji: "",
    color: "#f97316",
    description: "Usado para exigencias abertas, documentos faltantes ou ajustes.",
    active: true,
    system: true,
  },
  {
    id: "retorno",
    label: "Retorno",
    emoji: "",
    color: "#ef4444",
    description: "Indica protocolos que aguardam resposta ou devolutiva do setor.",
    active: true,
    system: true,
  },
  {
    id: "analise",
    label: "Analise",
    emoji: "",
    color: "#3b82f6",
    description: "Marca fluxos em verificacao tecnica ou parecer interno.",
    active: true,
    system: true,
  },
];

function normalizeMarkerPreset(raw: unknown): MarkerPreset | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<MarkerPreset>;
  if (typeof candidate.id !== "string" || typeof candidate.label !== "string" || typeof candidate.color !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    label: candidate.label.trim(),
    emoji: typeof candidate.emoji === "string" ? candidate.emoji.trim() : "",
    color: candidate.color,
    description: typeof candidate.description === "string" ? candidate.description.trim() : "",
    active: typeof candidate.active === "boolean" ? candidate.active : true,
    system: typeof candidate.system === "boolean" ? candidate.system : SYSTEM_MARKER_IDS.has(candidate.id),
  };
}

function safeParse(raw: string | null): MarkerPreset[] | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return null;

    const normalized = parsed
      .map((item) => normalizeMarkerPreset(item))
      .filter((item): item is MarkerPreset => item !== null);

    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

export function formatMarkerLabel(preset: Pick<MarkerPreset, "label" | "emoji">) {
  return preset.label.trim();
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

  const addPreset = (preset: NewMarkerPreset) => {
    const label = preset.label.trim();
    if (!label) return;

    const id = `${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    setPresets((current) => [
      {
        id,
        label,
        emoji: preset.emoji?.trim() || "",
        color: preset.color,
        description: preset.description?.trim() || "",
        active: preset.active ?? true,
        system: preset.system ?? false,
      },
      ...current,
    ]);
  };

  const updatePreset = (id: string, updates: Partial<Omit<MarkerPreset, "id" | "system">>) => {
    setPresets((current) =>
      current.map((item) => {
        if (item.id !== id) return item;

        const nextLabel = typeof updates.label === "string" ? updates.label.trim() : item.label;
        return {
          ...item,
          ...updates,
          label: nextLabel || item.label,
          emoji: typeof updates.emoji === "string" ? updates.emoji.trim() : item.emoji,
          description: typeof updates.description === "string" ? updates.description.trim() : item.description,
        };
      }),
    );
  };

  const togglePresetActive = (id: string) => {
    setPresets((current) =>
      current.map((item) => (item.id === id ? { ...item, active: !item.active } : item)),
    );
  };

  const removePreset = (id: string) => {
    setPresets((current) => current.filter((item) => item.id !== id));
  };

  return { presets, presetMap, addPreset, updatePreset, togglePresetActive, removePreset };
}
