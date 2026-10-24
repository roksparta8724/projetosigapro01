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

// Explicit isolated QA must fail closed on localhost AND Vercel previews.
// No fallback to official endpoints is permitted if the requested pair is missing,
// mismatched or points to the known official Neon endpoint.
const isolatedRequested =
  !isNeonProduction && import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true";
const authOverride = String(import.meta.env.VITE_NEON_AUTH_URL || "").replace(/\\/+$/, "");
const dataOverride = String(import.meta.env.VITE_NEON_DATA_API_URL || "").replace(/\\/+$/, "");
function neonEndpointIdentity(raw: string) {
  try {
    const host = new URL(raw).hostname;
    return host.match(/^(ep-[^.]+)\\.(?:neonauth|apirest)\\./)?.[1] || "";
  } catch { return ""; }
}
const isolatedEndpoint =
  neonEndpointIdentity(authOverride) &&
  neonEndpointIdentity(authOverride) === neonEndpointIdentity(dataOverride) &&
  neonEndpointIdentity(authOverride) !== neonEndpointIdentity(VALIDATED_NEON_AUTH_URL);
const isolatedReady = isolatedRequested && Boolean(isolatedEndpoint);

const NEON_AUTH_URL = String(
  isNeonProduction || (isLocalNeonRuntime && !isolatedRequested)
    ? VALIDATED_NEON_AUTH_URL
    : isolatedRequested
      ? (isolatedReady ? authOverride : "")
      : import.meta.env.VITE_NEON_AUTH_URL || (isNeonPreview ? VALIDATED_NEON_AUTH_URL : ""),
).replace(/\\/+$/, "");

const NEON_DATA_API_URL = String(
  isNeonProduction || (isLocalNeonRuntime && !isolatedRequested)
    ? VALIDATED_NEON_DATA_API_URL
    : isolatedRequested
      ? (isolatedReady ? dataOverride : "")
      : import.meta.env.VITE_NEON_DATA_API_URL || (isNeonPreview ? VALIDATED_NEON_DATA_API_URL : ""),
).replace(/\\/+$/, "");

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
