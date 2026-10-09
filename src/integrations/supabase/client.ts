import { createClient } from "@supabase/supabase-js";
import { isSupabaseBackend } from "@/integrations/backend/config";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasLegacySupabaseCredentials = Boolean(
  SUPABASE_URL &&
  SUPABASE_PUBLISHABLE_KEY &&
  SUPABASE_URL !== "undefined" &&
  SUPABASE_PUBLISHABLE_KEY !== "undefined",
);

// O cliente legado só existe quando o rollback Supabase é explicitamente ativado.
// Nos domínios oficiais, o Neon é obrigatório e nenhum cliente Supabase é
// inicializado, evitando sessão/cache paralelo durante a operação normal.
export const hasSupabaseEnv = isSupabaseBackend && hasLegacySupabaseCredentials;

export const supabase = hasSupabaseEnv
  ? createClient(SUPABASE_URL as string, SUPABASE_PUBLISHABLE_KEY as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "sigapro-supabase-auth",
        detectSessionInUrl: true,
      },
      global: {
        headers: {
          "X-Client-Info": "sigapro-web",
        },
      },
    })
  : null;
