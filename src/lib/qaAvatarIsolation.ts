/**
 * Isolated QA must not render copied profile images from the official site
 * or any third-party host. Browser-generated previews stay available.
 *
 * This is a presentation guard, NOT an authentication or storage policy.
 */
export function safeAvatarUrlInQa(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (import.meta.env.VITE_SIGAPRO_NEON_ISOLATED !== "true") return raw;
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") &&
      !/[\r\n]/.test(raw)) return raw;
  // Preserve editor output; disallow SVG/HTML data URIs in a copied profile.
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(raw)) return raw;
  if (typeof window !== "undefined") {
    try {
      const origin = window.location.origin;
      if (raw.startsWith("blob:") && new URL(raw.slice(5)).origin === origin) return raw;
      if (/^https?:\/\//i.test(raw) && new URL(raw).origin === origin) return raw;
    } catch { /* invalid input is blocked */ }
  }
  return "";
}
