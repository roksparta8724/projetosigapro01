export type BackendMode = "supabase" | "neon";

function isNeonPreviewHostname() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname.includes("projetosigapro01-git-neon-first-") &&
    hostname.endsWith(".vercel.app")
  );
}

export const isNeonPreview = isNeonPreviewHostname();

function readBackendMode(): BackendMode {
  const configured = String(import.meta.env.VITE_BACKEND ?? "").trim().toLowerCase();
  if (configured === "neon") return "neon";
  if (configured === "supabase") return "supabase";
  return isNeonPreview ? "neon" : "supabase";
}

export const backendMode: BackendMode = readBackendMode();
export const isNeonBackend = backendMode === "neon";
export const isSupabaseBackend = backendMode === "supabase";
