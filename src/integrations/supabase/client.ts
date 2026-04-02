import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(
  SUPABASE_URL &&
  SUPABASE_PUBLISHABLE_KEY &&
  SUPABASE_URL !== "undefined" &&
  SUPABASE_PUBLISHABLE_KEY !== "undefined",
);

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
