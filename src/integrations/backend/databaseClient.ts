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

const explicitNeonAuthUrl = String(import.meta.env.VITE_NEON_AUTH_URL || "").trim();
const explicitNeonDataApiUrl = String(import.meta.env.VITE_NEON_DATA_API_URL || "").trim();

const NEON_AUTH_URL = String(
  isLocalNeonRuntime && explicitNeonAuthUrl
    ? explicitNeonAuthUrl
    : isNeonProduction || isLocalNeonRuntime
      ? VALIDATED_NEON_AUTH_URL
      : explicitNeonAuthUrl || (isNeonPreview ? VALIDATED_NEON_AUTH_URL : ""),
).replace(/\/+$/, "");

const NEON_DATA_API_URL = String(
  isLocalNeonRuntime && explicitNeonDataApiUrl
    ? explicitNeonDataApiUrl
    : isNeonProduction || isLocalNeonRuntime
      ? VALIDATED_NEON_DATA_API_URL
      : explicitNeonDataApiUrl || (isNeonPreview ? VALIDATED_NEON_DATA_API_URL : ""),
).replace(/\/+$/, "");

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
