/** Single authoritative endpoint resolver for all institutional R2 handlers. */
function env(key: string) { return String(process.env[key] || "").replace(/^['"]|['"]$/g, "").trim(); }
export function getR2EndpointCandidates(): string[] {
  const candidates: string[] = [];
  const endpoint = env("R2_ENDPOINT");
  if (endpoint) {
    try {
      const u = new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`);
      if (u.protocol === "https:") candidates.push(`${u.protocol}//${u.host}`);
    } catch { /* malformed endpoint: use account-ID fallback only */ }
  }
  const id = env("R2_ACCOUNT_ID").replace(/^https?:\/\//i, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, "").replace(/[^a-zA-Z0-9]/g, "");
  if (id && !/^sua_?account_?id$/i.test(id))
    candidates.push(`https://${id}.r2.cloudflarestorage.com`);
  return [...new Set(candidates)];
}
export function resolveR2Endpoint(): string { return getR2EndpointCandidates()[0] || ""; }
