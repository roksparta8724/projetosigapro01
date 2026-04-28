export type MarkerPaletteEntry = {
  id: string;
  label: string;
  value: string;
  bg: string;
  border: string;
  text: string;
};

export const DEFAULT_MARKER_COLOR_ID = "blue";

export const MARKER_COLOR_PALETTE: MarkerPaletteEntry[] = [
  { id: "blue", label: "Azul institucional", value: "#2563eb", bg: "rgba(37,99,235,0.16)", border: "rgba(37,99,235,0.28)", text: "#1d4ed8" },
  { id: "emerald", label: "Verde institucional", value: "#0f766e", bg: "rgba(15,118,110,0.16)", border: "rgba(15,118,110,0.28)", text: "#0f766e" },
  { id: "violet", label: "Violeta executivo", value: "#7c3aed", bg: "rgba(124,58,237,0.16)", border: "rgba(124,58,237,0.28)", text: "#6d28d9" },
  { id: "orange", label: "Laranja estrategico", value: "#ea580c", bg: "rgba(234,88,12,0.16)", border: "rgba(234,88,12,0.28)", text: "#c2410c" },
  { id: "red", label: "Vermelho critico", value: "#dc2626", bg: "rgba(220,38,38,0.16)", border: "rgba(220,38,38,0.28)", text: "#b91c1c" },
  { id: "green", label: "Verde aprovado", value: "#16a34a", bg: "rgba(22,163,74,0.16)", border: "rgba(22,163,74,0.28)", text: "#15803d" },
  { id: "cyan", label: "Ciano operacional", value: "#0891b2", bg: "rgba(8,145,178,0.16)", border: "rgba(8,145,178,0.28)", text: "#0e7490" },
  { id: "indigo", label: "Indigo premium", value: "#4338ca", bg: "rgba(67,56,202,0.16)", border: "rgba(67,56,202,0.28)", text: "#3730a3" },
  { id: "magenta", label: "Magenta institucional", value: "#be123c", bg: "rgba(190,18,60,0.16)", border: "rgba(190,18,60,0.28)", text: "#9f1239" },
  { id: "gold", label: "Dourado tatico", value: "#ca8a04", bg: "rgba(202,138,4,0.16)", border: "rgba(202,138,4,0.28)", text: "#a16207" },
  { id: "graphite", label: "Grafite neutro", value: "#475569", bg: "rgba(71,85,105,0.16)", border: "rgba(71,85,105,0.28)", text: "#334155" },
  { id: "royal", label: "Azul royal", value: "#1d4ed8", bg: "rgba(29,78,216,0.16)", border: "rgba(29,78,216,0.28)", text: "#1e40af" },
];

export const MARKER_COLOR_OPTIONS = MARKER_COLOR_PALETTE.map((entry) => ({
  id: entry.id,
  label: entry.label,
  value: entry.value,
  bg: entry.bg,
  border: entry.border,
  text: entry.text,
})) as const;

const LEGACY_MARKER_COLOR_ALIASES: Record<string, string> = {
  "#3b82f6": "blue",
  "#0ea5e9": "cyan",
  "#10b981": "green",
  "#22c55e": "green",
  "#8b5cf6": "violet",
  "#f59e0b": "gold",
  "#ef4444": "red",
  "#64748b": "graphite",
};

export function getMarkerPaletteEntry(colorIdOrValue: string | null | undefined) {
  const normalized = (colorIdOrValue ?? "").trim().toLowerCase();
  if (!normalized) return MARKER_COLOR_PALETTE[0];

  return (
    MARKER_COLOR_PALETTE.find((entry) => entry.id === normalized) ||
    MARKER_COLOR_PALETTE.find((entry) => entry.value.toLowerCase() === normalized) ||
    MARKER_COLOR_PALETTE.find((entry) => entry.id === LEGACY_MARKER_COLOR_ALIASES[normalized]) ||
    MARKER_COLOR_PALETTE[0]
  );
}

export function getDefaultMarkerPaletteEntry() {
  return getMarkerPaletteEntry(DEFAULT_MARKER_COLOR_ID);
}

export function getMarkerColorId(colorIdOrValue: string | null | undefined) {
  return getMarkerPaletteEntry(colorIdOrValue).id;
}
