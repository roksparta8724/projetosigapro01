/**
 * Private SIGAPRO avatar images are fetched with the active Neon/Supabase
 * Bearer session and rendered as same-origin blob URLs. Do not embed a token
 * in a document URL, pass it to a third-party CDN, or persist a blob reference.
 *
 * Fetched images remain compatible with the crop editor's canvas (a cross-
 * origin presigned R2 URL can taint canvas without the right bucket CORS).
 */
const AVATAR_KEY =
  /^(?:municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|platform)\/profiles\/avatars\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/i;
const MAX_AVATAR_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = /^(?:image\/png|image\/jpeg|image\/gif|image\/webp|image\/avif)$/i;

export function privateAvatarObjectKey(source: string | null | undefined): string {
  const input = String(source || "").trim();
  if (!input.startsWith("/api/profile-avatar-open?")) return "";
  try {
    const url = new URL(input, "https://sigapro.local");
    if (url.pathname !== "/api/profile-avatar-open" || url.searchParams.has("source"))
      return "";
    const key = url.searchParams.get("objectKey") || "";
    return AVATAR_KEY.test(key) ? key : "";
  } catch {
    return "";
  }
}

export type AuthorizedAvatarUrl = { url: string; revoke: () => void };

export async function resolveAuthorizedAvatarUrl(
  source: string,
  signal?: AbortSignal,
): Promise<AuthorizedAvatarUrl> {
  const key = privateAvatarObjectKey(source);
  if (!key) return { url: source, revoke: () => {} };

  // Lazy import: the public login/login landing bundle must not eagerly load
  // profile storage or session SDKs just to display an anonymous page.
  const { backendClient } = await import("@/integrations/backend/databaseClient");
  const result = await backendClient?.auth?.getSession?.();
  const session = result?.data?.session ?? null;
  const token =
    session?.access_token || session?.accessToken || session?.token || "";
  if (typeof token !== "string" || !token)
    throw new Error("Sessão necessária para visualizar a foto.");

  const response = await fetch(
    "/api/profile-avatar-open?objectKey=" + encodeURIComponent(key),
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "image/png,image/jpeg,image/webp,image/gif,image/avif",
      },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    },
  );
  if (!response.ok) throw new Error("Não foi possível confirmar o acesso à foto.");
  const mime = String(response.headers.get("content-type") || "").split(";")[0].trim();
  const advertisedLength = Number(response.headers.get("content-length") || "0");
  if (!ALLOWED_IMAGE_MIME.test(mime) || !Number.isFinite(advertisedLength) ||
      advertisedLength > MAX_AVATAR_BYTES)
    throw new Error("Resposta de foto inválida.");
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_AVATAR_BYTES ||
      !ALLOWED_IMAGE_MIME.test(blob.type))
    throw new Error("Arquivo de foto inválido.");

  if (signal?.aborted) throw new Error("Leitura de foto cancelada.");
  const temporaryUrl = URL.createObjectURL(blob);
  return {
    url: temporaryUrl,
    revoke: () => URL.revokeObjectURL(temporaryUrl),
  };
}
