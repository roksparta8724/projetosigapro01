/**
 * Geometria única do recorte circular do SIGAPRO.
 *
 * O editor usa um palco quadrado de no máximo 360px e máscara inset-[8%],
 * resultando numa área de recorte de 84% do palco. As coordenadas persistidas
 * são deslocamentos CSS (px) nesse círculo de referência. Avatares pequenos
 * reproduzem o mesmo recorte proporcionalmente, sem abrir lacunas brancas.
 */
export const AVATAR_CROP_MASK_FACTOR = 0.84;
export const DEFAULT_AVATAR_EDITOR_DIAMETER = 360 * AVATAR_CROP_MASK_FACTOR;

export interface CircularAvatarGeometryInput {
  naturalWidth: number;
  naturalHeight: number;
  diameter: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  /** Diâmetro real da máscara do editor quando as coordenadas foram escolhidas. */
  editorSize?: number;
}

export interface CircularAvatarGeometry {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export function resolveCircularAvatarGeometry(input: CircularAvatarGeometryInput): CircularAvatarGeometry | null {
  const { naturalWidth, naturalHeight, diameter } = input;
  if (
    !Number.isFinite(naturalWidth) || naturalWidth <= 0 ||
    !Number.isFinite(naturalHeight) || naturalHeight <= 0 ||
    !Number.isFinite(diameter) || diameter <= 0
  ) return null;

  const safeScale = Number.isFinite(input.scale) ? Math.max(1, input.scale ?? 1) : 1;
  const coverScale = Math.max(diameter / naturalWidth, diameter / naturalHeight) * safeScale;
  // Em ponto flutuante, naturalWidth * (diameter / naturalWidth) pode
  // resultar em 31.999999999999996 para um círculo de 32px. Garantir
  // dimensões mínimas explícitas evita uma fresta na borda da máscara.
  const minimumCover = diameter * safeScale;
  const width = Math.max(minimumCover, naturalWidth * coverScale);
  const height = Math.max(minimumCover, naturalHeight * coverScale);

  const editorSize = input.editorSize && Number.isFinite(input.editorSize) && input.editorSize > 0
    ? input.editorSize
    : DEFAULT_AVATAR_EDITOR_DIAMETER;
  const ratio = diameter / editorSize;
  const maxOffsetX = Math.max(0, (width - diameter) / 2);
  const maxOffsetY = Math.max(0, (height - diameter) / 2);
  const requestedX = Number.isFinite(input.offsetX) ? (input.offsetX ?? 0) * ratio : 0;
  const requestedY = Number.isFinite(input.offsetY) ? (input.offsetY ?? 0) * ratio : 0;

  // O deslocamento nunca pode ultrapassar a área coberta pelo bitmap.
  // Mesmo coordenadas antigas/fora de escala não exibem faixas brancas.
  return {
    width,
    height,
    offsetX: Math.max(-maxOffsetX, Math.min(maxOffsetX, requestedX)),
    offsetY: Math.max(-maxOffsetY, Math.min(maxOffsetY, requestedY)),
  };
}
