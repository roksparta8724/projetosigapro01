import { createClient as createNeonClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { isNeonBackend } from "@/integrations/backend/config";
import { supabase } from "@/integrations/supabase/client";

const NEON_AUTH_URL = String(import.meta.env.VITE_NEON_AUTH_URL || "").replace(/\/+$/, "");
const NEON_DATA_API_URL = String(import.meta.env.VITE_NEON_DATA_API_URL || "").replace(/\/+$/, "");

export const hasNeonBackendEnv = Boolean(
  NEON_AUTH_URL &&
  NEON_DATA_API_URL &&
  NEON_AUTH_URL !== "undefined" &&
  NEON_DATA_API_URL !== "undefined"
);

export const neonAccountClient: any = NEON_AUTH_URL
  ? createAuthClient(NEON_AUTH_URL)
  : null;

export const neonClient = hasNeonBackendEnv
  ? createNeonClient({
      auth: {
        adapter: SupabaseAuthAdapter(),
        url: NEON_AUTH_URL,
        allowAnonymous: true,
      },
      dataApi: {
        url: NEON_DATA_API_URL,
      },
    })
  : null;

export const backendClient: any = isNeonBackend ? neonClient : supabase;
export const databaseClient: any = backendClient;

export const hasDatabaseEnv = isNeonBackend
  ? hasNeonBackendEnv
  : Boolean(supabase);

export const hasBackendEnv = hasDatabaseEnv;
