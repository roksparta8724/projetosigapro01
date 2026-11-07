/**
 * Shared fail-closed rules for signing municipal object URLs.
 * An R2 key is not a file-system path, but proxy/CDN URL normalization makes
 * dot segments, encoded separators and controls unsafe in signed URLs.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PUBLIC_LEGISLATION = new RegExp(
  "^municipalities/" + UUID +
  "/legislation(?:/(?:[a-z0-9_. ()-]+/)*[a-z0-9_. ()-]+\\.pdf" +
  "|-(?:plano-diretor|uso-solo|zoneamento|leis-complementares|registry)/(?:[a-z0-9_. ()-]+/)*[a-z0-9_. ()-]+\\.pdf)$",
  "i",
);

export function isSafeR2ObjectKey(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 1024 ||
      value !== value.trim() || value.startsWith("/") || value.endsWith("/") ||
      /[\\%?#\x00-\x1f\x7f]/.test(value) || value.includes("//")) return false;
  return value.split("/").every(segment =>
    segment.length > 0 && segment.length <= 255 &&
    segment !== "." && segment !== ".." && !segment.includes(".."),
  );
}

/**
 * Compatibility is limited to PDFs in existing official legislation folders.
 * No arbitrary process object, key traversal or non-PDF may be publicly signed.
 */
export function isPublicLegislationPdfKey(value: unknown): value is string {
  return isSafeR2ObjectKey(value) && PUBLIC_LEGISLATION.test(value);
}

export function signedR2Ttl(value: unknown, privateDocument: boolean): number {
  const maximum = privateDocument ? 900 : 3600;
  return typeof value === "number" && Number.isSafeInteger(value)
    ? Math.min(maximum, Math.max(60, value))
    : maximum;
}
