import { createClient as createNeonClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { isNeonBackend, isNeonPreview, isNeonProduction } from "@/integrations/backend/config";
import { supabase as legacySupabaseClient } from "@/integrations/supabase/client";

const VALIDATED_NEON_AUTH_URL =
  "https://ep-blue-cloud-b4hhgb4t.neonauth.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/auth";
const VALIDATED_NEON_DATA_API_URL =
  "https://ep-blue-cloud-b4hhgb4t.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1";

const isLocalNeonRuntime =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname.toLowerCase());

// Local QA must be explicitly enabled with BOTH auth and data URLs from the
// SAME Neon branch. Otherwise localhost uses the official pair, never a mix.
// The server enforces the matching data URL independently.
const localIsolatedRequested =
  isLocalNeonRuntime && import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true";
const localAuthOverride = String(import.meta.env.VITE_NEON_AUTH_URL || "").replace(/\\/+$/, "");
const localDataOverride = String(import.meta.env.VITE_NEON_DATA_API_URL || "").replace(/\\/+$/, "");
function neonEndpointIdentity(raw: string) {
  try {
    const host = new URL(raw).hostname;
    return host.match(/^(ep-[^.]+)\\.(?:neonauth|apirest)\\./)?.[1] || "";
  } catch { return ""; }
}
const localIsolatedReady =
  localIsolatedRequested &&
  !!neonEndpointIdentity(localAuthOverride) &&
  neonEndpointIdentity(localAuthOverride) === neonEndpointIdentity(localDataOverride);

const NEON_AUTH_URL = String(
  isNeonProduction || (isLocalNeonRuntime && !localIsolatedReady)
    ? VALIDATED_NEON_AUTH_URL
    : import.meta.env.VITE_NEON_AUTH_URL || (isNeonPreview ? VALIDATED_NEON_AUTH_URL : ""),
).replace(/\/+$/, "");

const NEON_DATA_API_URL = String(
  isNeonProduction || (isLocalNeonRuntime && !localIsolatedReady)
    ? VALIDATED_NEON_DATA_API_URL
    : import.meta.env.VITE_NEON_DATA_API_URL || (isNeonPreview ? VALIDATED_NEON_DATA_API_URL : ""),
).replace(/\/+$/, "");

export const neonAuthUrl = NEON_AUTH_URL;
export const neonDataApiUrl = NEON_DATA_API_URL;

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

export const backendClient: any = isNeonBackend ? neonClient : legacySupabaseClient;
export const databaseClient: any = backendClient;

export const hasDatabaseEnv = isNeonBackend
  ? hasNeonBackendEnv
  : Boolean(legacySupabaseClient);

export const hasBackendEnv = hasDatabaseEnv;
