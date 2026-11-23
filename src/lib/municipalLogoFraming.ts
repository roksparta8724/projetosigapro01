/**
 * Single no-crop contract for municipal logos.
 *
 * Both 188px admin editors and the responsive real header/footer use
 * object-fit: contain. Optical base factor 2/3 makes 1.50x exactly the
 * original fully fitted image. Zoom above 1.50x is intentional, opt-in and can crop the viewport.
 *
 * Offset limits are computed in editor coordinates and bound to a generous editor range. The editor applies the exact physical
 * limits using the native aspect ratio; saving must not reset that geometry.
 */
export const MUNICIPAL_LOGO_BASE_RATIO = 2 / 3;
export const MUNICIPAL_LOGO_MIN_ZOOM = 1;
export const MUNICIPAL_LOGO_FULL_FIT_ZOOM = 1.5;
export const MUNICIPAL_LOGO_MAX_ZOOM = 5;
/** Footer retains its own positioning independently of the header. */
export const MUNICIPAL_FOOTER_LOGO_MAX_ZOOM = 5;
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
    finiteOr(frame?.scale, MUNICIPAL_LOGO_FULL_FIT_ZOOM),
    MUNICIPAL_LOGO_MIN_ZOOM,
    variant === "footer" ? MUNICIPAL_FOOTER_LOGO_MAX_ZOOM : MUNICIPAL_LOGO_MAX_ZOOM,
  );
  // Pan is precisely clamped by ImageFrameEditor against natural aspect ratio.
  // The persisted frame should not be clamped again as if every logo is square.
  const estimatedMargin = Math.abs(
    (MUNICIPAL_LOGO_EDITOR_SIZE * (1 - MUNICIPAL_LOGO_BASE_RATIO * scale)) / 2,
  );
  const maxPan = Math.max(MUNICIPAL_LOGO_EDITOR_SIZE / 2, estimatedMargin);
  const offsetX = clamp(finiteOr(frame?.offsetX, 0), -maxPan, maxPan);
  const offsetY = clamp(finiteOr(frame?.offsetY, 0), -maxPan, maxPan);
  return { scale, offsetX, offsetY };
}

export function fullMunicipalLogoFrame(): MunicipalLogoFrame {
  // Reset always displays the entire uploaded image; extra footer zoom is opt-in.
  return { scale: MUNICIPAL_LOGO_FULL_FIT_ZOOM, offsetX: 0, offsetY: 0 };
}
