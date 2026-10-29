export type BackendMode = "supabase" | "neon";

export function isNeonPreviewHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized.includes("projetosigapro01-git-neon-first-") &&
    normalized.endsWith(".vercel.app")
  );
}

export function isNeonQaHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized.startsWith("projetosigapro01-git-qa-sigapro-") &&
    normalized.endsWith(".vercel.app");
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

  // Canonical architecture: Neon is the default backend everywhere.
  // Supabase exists only as an explicit rollback/development compatibility mode.
  // Official domains and isolated QA can never be redirected to the
  // legacy backend, even by inherited/stale VITE_BACKEND=supabase.
  if (isNeonProductionHostname(resolvedHostname) ||
      isNeonQaHostname(resolvedHostname) ||
      import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true") return "neon";

  if (configured === "supabase") return "supabase";
  if (configured === "neon") return "neon";

  // Unknown hosts, previews and local development default to Neon. Anyone who
  // intentionally needs the legacy backend must opt in with VITE_BACKEND=supabase.
  return "neon";
}

export const backendMode: BackendMode = resolveBackendMode();
export const isNeonBackend = backendMode === "neon";
export const isSupabaseBackend = backendMode === "supabase";
