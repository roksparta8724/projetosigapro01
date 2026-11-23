/**
 * A professional can share the public sign-up link with a protocol already
 * selected. The URL is NOT a credential, owner access always requires
 * authenticated owner profile, full CPF/CNPJ validation and professional approval.
 * Never store the owner's identity document, email or conversation text here.
 */
export type OwnerInvitation = { protocol: string; tenantSlug: string; expiresAt: number };
export const OWNER_INVITATION_KEY = "sigapro:owner-invitation:v1";
const VERCEL_PREVIEW_ACCESS_KEY = "sigapro:qa-share-access:v1";

/** Carry an existing, temporary Vercel preview share credential only within
 * the same browser session. No credential is created, hardcoded or sent to APIs.
 * The invited owner still must authenticate and validate their full document. */
export function captureOwnerPreviewAccess(): void {
  if (typeof window === "undefined" || !window.location.hostname.endsWith(".vercel.app")) return;
  try {
    const token = new URLSearchParams(window.location.search).get("_vercel_share");
    if (token && /^[a-zA-Z0-9_-]{16,256}$/.test(token)) {
      window.sessionStorage.setItem(VERCEL_PREVIEW_ACCESS_KEY, token);
    }
  } catch { /* preview storage can be unavailable */ }
}
const TTL_MS = 48 * 60 * 60 * 1000;

export function normalizeInvitedProtocol(protocol: string | null | undefined): string {
  const value = String(protocol ?? "").trim();
  return value.length >= 5 && value.length <= 120 &&
    /^[\p{L}\p{N}./_\-\s]+$/u.test(value) ? value : "";
}
export function normalizeInvitationTenant(slug: string | null | undefined): string {
  const value = String(slug ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{2,90}$/.test(value) ? value : "";
}
export function buildOwnerInvitationUrl(origin: string, tenantSlug: string, protocol: string): string {
  const tenant = normalizeInvitationTenant(tenantSlug);
  const number = normalizeInvitedProtocol(protocol);
  if (!tenant || !number) throw new Error("Informe a Prefeitura e um protocolo válido.");
  const url = new URL("/criar-conta", origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Um convite deve usar conexão HTTPS.");
  }
  url.searchParams.set("tenant", tenant);
  url.searchParams.set("perfil", "proprietario");
  url.searchParams.set("protocolo", number);
  // Preview links have separate Vercel access protection. When the professional
  // entered with a share link, include that same short-lived authorization so
  // the invited owner can reach the PUBLIC registration page in homologation.
  // This never grants SIGAPRO account access or process read permissions.
  if (typeof window !== "undefined" && url.origin === window.location.origin &&
      url.hostname.endsWith(".vercel.app")) {
    try {
      const shareToken = new URLSearchParams(window.location.search).get("_vercel_share")
        || window.sessionStorage.getItem(VERCEL_PREVIEW_ACCESS_KEY);
      if (shareToken && /^[a-zA-Z0-9_-]{16,256}$/.test(shareToken)) {
        url.searchParams.set("_vercel_share", shareToken);
      }
    } catch { /* no preview token: use the normal guarded URL */ }
  }
  return url.toString();
}
export function rememberOwnerInvitation(tenantSlug: string, protocol: string): boolean {
  const tenant = normalizeInvitationTenant(tenantSlug);
  const number = normalizeInvitedProtocol(protocol);
  if (!tenant || !number || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(OWNER_INVITATION_KEY, JSON.stringify({
      tenantSlug: tenant, protocol: number, expiresAt: Date.now() + TTL_MS,
    } satisfies OwnerInvitation));
    return true;
  } catch { return false; }
}
export function readOwnerInvitation(): OwnerInvitation | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(OWNER_INVITATION_KEY);
    if (!stored) return null;
    const data = JSON.parse(stored) as Partial<OwnerInvitation>;
    if (typeof data.expiresAt !== "number" || data.expiresAt <= Date.now() ||
        !normalizeInvitationTenant(data.tenantSlug) || !normalizeInvitedProtocol(data.protocol)) {
      window.localStorage.removeItem(OWNER_INVITATION_KEY);
      return null;
    }
    return { tenantSlug: normalizeInvitationTenant(data.tenantSlug),
      protocol: normalizeInvitedProtocol(data.protocol), expiresAt: data.expiresAt };
  } catch { return null; }
}
export function clearOwnerInvitation(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(OWNER_INVITATION_KEY); } catch { /* storage unavailable */ }
}
