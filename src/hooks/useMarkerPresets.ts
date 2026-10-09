import { useEffect, useMemo, useState } from "react";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import {
  DEFAULT_MARKER_COLOR_ID,
  MARKER_COLOR_OPTIONS,
  getMarkerPaletteEntry,
} from "@/lib/markerPalette";

export type MarkerPreset = {
  id: string;
  label: string;
  emoji?: string;
  colorId?: string;
  color?: string;
  description?: string;
  active?: boolean;
  system?: boolean;
};

export type NewMarkerPreset = {
  label: string;
  emoji?: string;
  color?: string;
  colorId?: string;
  description?: string;
  active?: boolean;
  system?: boolean;
};

export const SYSTEM_MARKER_IDS = new Set(["favorito", "prioridade", "pendencia", "retorno", "analise"]);

const LEGACY_STORAGE_KEY = "sigapro-marker-presets";

function buildStorageKey(profileId: string) {
  return `sigapro-marker-presets:${profileId}`;
}

const DEFAULT_PRESETS: MarkerPreset[] = [
  {
    id: "favorito",
    label: "Favorito",
    emoji: "",
    colorId: "green",
    color: "#16a34a",
    description: "Destaque para protocolos acompanhados de perto pela operacao.",
    active: true,
    system: true,
  },
  {
    id: "prioridade",
    label: "Prioridade",
    emoji: "",
    colorId: "gold",
    color: "#ca8a04",
    description: "Sinaliza processos que pedem tratativa preferencial na fila.",
    active: true,
    system: true,
  },
  {
    id: "pendencia",
    label: "Pendencia",
    emoji: "",
    colorId: "orange",
    color: "#ea580c",
    description: "Usado para exigencias abertas, documentos faltantes ou ajustes.",
    active: true,
    system: true,
  },
  {
    id: "retorno",
    label: "Retorno",
    emoji: "",
    colorId: "red",
    color: "#dc2626",
    description: "Indica protocolos que aguardam resposta ou devolutiva do setor.",
    active: true,
    system: true,
  },
  {
    id: "analise",
    label: "Analise",
    emoji: "",
    colorId: "blue",
    color: "#2563eb",
    description: "Marca fluxos em verificacao tecnica ou parecer interno.",
    active: true,
    system: true,
  },
];

function normalizeMarkerPreset(raw: unknown): MarkerPreset | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<MarkerPreset>;
  if (typeof candidate.id !== "string" || typeof candidate.label !== "string") {
    return null;
  }

  const paletteEntry = getMarkerPaletteEntry(candidate.colorId ?? candidate.color ?? DEFAULT_MARKER_COLOR_ID);

  return {
    id: candidate.id,
    label: candidate.label.trim(),
    emoji: typeof candidate.emoji === "string" ? candidate.emoji.trim() : "",
    colorId: paletteEntry.id,
    color: paletteEntry.value,
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
  const { authenticatedProfileId, authenticatedUserId } = useAuthGateway();
  const preferenceOwnerId = authenticatedProfileId || authenticatedUserId || "";
  const [presets, setPresets] = useState<MarkerPreset[]>(DEFAULT_PRESETS);
  const [loadedOwnerId, setLoadedOwnerId] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || !preferenceOwnerId) {
      setPresets(DEFAULT_PRESETS);
      setLoadedOwnerId("");
      return;
    }

    const scopedKey = buildStorageKey(preferenceOwnerId);
    const scoped = safeParse(window.localStorage.getItem(scopedKey));
    const legacy = scoped ? null : safeParse(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    const next = scoped ?? legacy ?? DEFAULT_PRESETS;

    setPresets(next);
    setLoadedOwnerId(preferenceOwnerId);

    if (!scoped && legacy) {
      window.localStorage.setItem(scopedKey, JSON.stringify(legacy));
    }
  }, [preferenceOwnerId]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !preferenceOwnerId ||
      loadedOwnerId !== preferenceOwnerId
    ) {
      return;
    }

    window.localStorage.setItem(buildStorageKey(preferenceOwnerId), JSON.stringify(presets));
  }, [loadedOwnerId, preferenceOwnerId, presets]);

  const presetMap = useMemo(() => {
    const map = new Map<string, MarkerPreset>();
    presets.forEach((preset) => map.set(preset.id, preset));
    return map;
  }, [presets]);

  const addPreset = (preset: NewMarkerPreset) => {
    const label = preset.label.trim();
    if (!label) return;

    const id = `${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
    const paletteEntry = getMarkerPaletteEntry(preset.colorId ?? preset.color ?? DEFAULT_MARKER_COLOR_ID);
    setPresets((current) => [
      {
        id,
        label,
        emoji: preset.emoji?.trim() || "",
        colorId: paletteEntry.id,
        color: paletteEntry.value,
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
        const paletteEntry =
          typeof updates.colorId === "string" || typeof updates.color === "string"
            ? getMarkerPaletteEntry(updates.colorId ?? updates.color ?? item.colorId)
            : getMarkerPaletteEntry(item.colorId);

        return {
          ...item,
          ...updates,
          label: nextLabel || item.label,
          emoji: typeof updates.emoji === "string" ? updates.emoji.trim() : item.emoji,
          colorId: paletteEntry.id,
          color: paletteEntry.value,
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

export { MARKER_COLOR_OPTIONS };
