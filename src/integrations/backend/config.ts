export type BackendMode = "supabase" | "neon";

function readBackendMode(): BackendMode {
  const raw = String(import.meta.env.VITE_BACKEND ?? "supabase").trim().toLowerCase();
  return raw === "neon" ? "neon" : "supabase";
}

export const backendMode: BackendMode = readBackendMode();
export const isNeonBackend = backendMode === "neon";
export const isSupabaseBackend = backendMode === "supabase";
