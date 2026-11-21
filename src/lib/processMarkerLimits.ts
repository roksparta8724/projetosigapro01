import { parseMarker } from "@/lib/platform";

/** Per authenticated profile, per process. The official situation is not a user marker. */
export const MAX_PERSONAL_PROCESS_MARKERS = 3;
export const PERSONAL_PROCESS_MARKER_LIMIT_ERROR =
  "Limite de 3 marcadores individuais por processo. Remova um marcador para aplicar outro.";

const keyOf = (label: string) => label.trim().toLocaleLowerCase("pt-BR");

export function canApplyPersonalProcessMarker(
  existingTags: readonly string[],
  label: string,
): boolean {
  const key = keyOf(label);
  if (!key) return false;
  // Applying an existing marker may update its color; it does not use a new slot.
  return existingTags.some(tag => keyOf(parseMarker(tag).label) === key) ||
    existingTags.length < MAX_PERSONAL_PROCESS_MARKERS;
}

export function assertPersonalProcessMarkerLimit(
  existingTags: readonly string[],
  label: string,
) {
  if (!canApplyPersonalProcessMarker(existingTags, label)) {
    throw new Error(PERSONAL_PROCESS_MARKER_LIMIT_ERROR);
  }
}

export function parseProfessionalMarkerSymbol(raw: string): {
  label: string;
  emoji?: string;
} {
  const match = raw.match(/^(\S+)\s+(.+)$/u);
  if (match && /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(match[1])) {
    return { emoji: match[1], label: match[2] };
  }
  return { label: raw };
}

export function composeProfessionalMarkerLabel(label: string, emoji?: string) {
  const name = label.trim();
  const symbol = emoji?.trim();
  return symbol ? `${symbol} ${name}` : name;
}
