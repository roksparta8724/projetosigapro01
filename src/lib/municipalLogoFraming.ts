/**
 * Single no-crop contract for municipal logos.
 *
 * Both 188px admin editors and the responsive real header/footer use
 * object-fit: contain. Optical base factor 2/3 makes 1.50x exactly the
 * original fully fitted image. A previous 5x slider cut the crest.
 *
 * Offset limits are computed in editor coordinates and conservatively bound
 * to the available margin. They remain safe even for non-square original
 * assets because contain never fills more than one axis.
 */
export const MUNICIPAL_LOGO_BASE_RATIO = 2 / 3;
export const MUNICIPAL_LOGO_MIN_ZOOM = 1;
export const MUNICIPAL_LOGO_MAX_ZOOM = 1.5;
/** Footer-only optical enlargement; header stays capped at the full 1.50x fit. */
export const MUNICIPAL_FOOTER_LOGO_MAX_ZOOM = 3;
export const MUNICIPAL_LOGO_EDITOR_SIZE = 188;

export interface MunicipalLogoFrame {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}
export function fitMunicipalLogoFrame(
  frame: Partial<MunicipalLogoFrame> | undefined | null,
  variant: "header" | "footer" = "header",
): MunicipalLogoFrame {
  const scale = clamp(
    finiteOr(frame?.scale, MUNICIPAL_LOGO_MAX_ZOOM),
    MUNICIPAL_LOGO_MIN_ZOOM,
    variant === "footer" ? MUNICIPAL_FOOTER_LOGO_MAX_ZOOM : MUNICIPAL_LOGO_MAX_ZOOM,
  );
  const margin = Math.max(
    0,
    (MUNICIPAL_LOGO_EDITOR_SIZE * (1 - MUNICIPAL_LOGO_BASE_RATIO * scale)) / 2,
  );
  // Avoid negative zero and preserve an exact centered origin at full fit.
  if (margin < 0.000001) return { scale, offsetX: 0, offsetY: 0 };
  const offsetX = clamp(finiteOr(frame?.offsetX, 0), -margin, margin);
  const offsetY = clamp(finiteOr(frame?.offsetY, 0), -margin, margin);
  return { scale, offsetX, offsetY };
}

export function fullMunicipalLogoFrame(): MunicipalLogoFrame {
  // Reset always displays the entire uploaded image; extra footer zoom is opt-in.
  return { scale: MUNICIPAL_LOGO_MAX_ZOOM, offsetX: 0, offsetY: 0 };
}
