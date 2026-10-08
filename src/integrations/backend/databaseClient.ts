import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isNeonBackend } from "@/integrations/backend/config";
import { supabase } from "@/integrations/supabase/client";

const NEON_DATA_API_URL = String(import.meta.env.VITE_NEON_DATA_API_URL || "").replace(/\/+$/, "");

let neonAccessToken: string | null = null;

export function setNeonAccessToken(token: string | null) {
  neonAccessToken = token;
}

export function getNeonAccessToken() {
  return neonAccessToken;
}

export const hasNeonDataApiEnv = Boolean(
  NEON_DATA_API_URL &&
  NEON_DATA_API_URL !== "undefined"
);

const neonDataClient: SupabaseClient | null = hasNeonDataApiEnv
  ? createClient(NEON_DATA_API_URL, "neon-data-api", {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      accessToken: async () => neonAccessToken,
      global: {
        headers: {
          "X-Client-Info": "sigapro-web-neon",
        },
      },
    })
  : null;

export const databaseClient: SupabaseClient | null =
  isNeonBackend ? neonDataClient : supabase;

export const hasDatabaseEnv = isNeonBackend
  ? hasNeonDataApiEnv
  : Boolean(supabase);
