/**
 * Direct Neon QA document reads produce private browser blob URLs.
 * Revoke only the URLs owned by this viewer; never revoke signed HTTPS links.
 */
export function revokeOwnedQaBlobUrl(
  url: string,
  revoke?: (url: string) => void,
): boolean {
  if (!url || !url.startsWith("blob:")) return false;
  const action = revoke ?? (
    typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function"
      ? (value: string) => URL.revokeObjectURL(value)
      : undefined
  );
  if (!action) return false;
  action(url);
  return true;
}
