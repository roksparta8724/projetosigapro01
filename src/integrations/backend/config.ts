export type BackendMode = "supabase" | "neon";

export function isNeonPreviewHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized.includes("projetosigapro01-git-neon-first-") &&
    normalized.endsWith(".vercel.app")
  );
}

export function isNeonProductionHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "sigapromunicipal.com.br" ||
    normalized === "www.sigapromunicipal.com.br" ||
    normalized.endsWith(".sigapromunicipal.com.br")
  );
}

function currentHostname() {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

const hostname = currentHostname();

export const isNeonPreview = isNeonPreviewHostname(hostname);
export const isNeonProduction = isNeonProductionHostname(hostname);

export function resolveBackendMode(input?: {
  hostname?: string;
  configured?: string;
}): BackendMode {
  const resolvedHostname = (input?.hostname ?? hostname).toLowerCase();
  const configured = String(
    input?.configured ?? import.meta.env.VITE_BACKEND ?? "",
  ).trim().toLowerCase();

  // Production cutover: the official root domain and every municipal subdomain
  // are pinned to the validated Neon branch. This intentionally takes precedence
  // over a stale VITE_BACKEND=supabase value left in Vercel.
  if (isNeonProductionHostname(resolvedHostname)) return "neon";

  if (configured === "neon") return "neon";
  if (configured === "supabase") return "supabase";

  return isNeonPreviewHostname(resolvedHostname) ? "neon" : "supabase";
}

export const backendMode: BackendMode = resolveBackendMode();
export const isNeonBackend = backendMode === "neon";
export const isSupabaseBackend = backendMode === "supabase";
