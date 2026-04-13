/**
 * api/health.ts — healthcheck & env diagnostics (safe)
 */

type Req = import("http").IncomingMessage & { method?: string };
type Res = import("http").ServerResponse;

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(body));
}

export default function handler(_req: Req, res: Res) {
  const env = {
    hasSupabaseUrl: Boolean(readEnv("VITE_SUPABASE_URL")),
    hasSupabaseKey: Boolean(readEnv("VITE_SUPABASE_PUBLISHABLE_KEY")),
    hasR2Endpoint: Boolean(readEnv("R2_ENDPOINT")),
    hasR2AccessKeyId: Boolean(readEnv("R2_ACCESS_KEY_ID")),
    hasR2Secret: Boolean(readEnv("R2_SECRET_ACCESS_KEY")),
    hasR2BucketLogos: Boolean(readEnv("R2_BUCKET_LOGOS")),
    hasR2BucketDocs: Boolean(readEnv("R2_BUCKET_DOCUMENTOS")),
    hasR2AccountId: Boolean(readEnv("R2_ACCOUNT_ID")),
    hasR2PublicBase: Boolean(readEnv("R2_PUBLIC_BASE_URL")),
    hasR2ApiBase: Boolean(readEnv("VITE_R2_API_BASE")),
    hasDevMunicipalityId: Boolean(readEnv("VITE_DEV_MUNICIPALITY_ID")),
    hasDevMunicipalitySlug: Boolean(readEnv("VITE_DEV_MUNICIPALITY_SLUG")),
    hasDevMunicipalityName: Boolean(readEnv("VITE_DEV_MUNICIPALITY_NAME")),
  };

  json(res, 200, {
    ok: true,
    env,
    timestamp: new Date().toISOString(),
  });
}
