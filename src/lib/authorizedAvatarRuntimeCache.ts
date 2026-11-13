import { privateAvatarObjectKey, resolveAuthorizedAvatarUrl, type AuthorizedAvatarUrl } from "@/lib/privateAvatarRead";

/**
 * Private raster cache for navigation within the CURRENT authenticated account.
 * Blob URLs are held only in volatile memory, never in localStorage or HTML URLs.
 * Ownership remains enforced server-side on the initial authenticated request.
 * Explicit logout / identity switch releases every blob and cancels stale results.
 */
const cached = new Map<string, AuthorizedAvatarUrl>();
const pending = new Map<string, Promise<string>>();
let generation = 0;
let activeOwner = "";
const MAX_CACHED_IMAGES = 8;

function validOwner(value: string): string {
  const owner = value.trim();
  return owner && owner !== "unknown" ? owner : "";
}
function cacheId(owner: string, source: string) {
  return JSON.stringify([owner, source]);
}

export function clearAuthorizedAvatarRuntimeCache(): void {
  generation += 1;
  activeOwner = "";
  for (const entry of cached.values()) entry.revoke();
  cached.clear();
  pending.clear();
}

export function getAuthorizedAvatarRuntimeUrl(ownerId: string, source: string): string {
  const owner = validOwner(ownerId);
  if (!owner || activeOwner !== owner || !privateAvatarObjectKey(source)) return "";
  return cached.get(cacheId(owner, source))?.url || "";
}

export async function loadAuthorizedAvatarRuntimeUrl(ownerId: string, source: string): Promise<string> {
  const owner = validOwner(ownerId);
  if (!owner || !privateAvatarObjectKey(source)) return "";
  // An authenticated user change must never reuse the previous owner's blob.
  if (activeOwner && activeOwner !== owner) clearAuthorizedAvatarRuntimeCache();
  activeOwner = owner;
  const id = cacheId(owner, source);
  const already = cached.get(id);
  if (already) return already.url;
  const fetching = pending.get(id);
  if (fetching) return fetching;

  const requestGeneration = generation;
  const task = resolveAuthorizedAvatarUrl(source).then((asset) => {
    if (requestGeneration !== generation || activeOwner !== owner) {
      asset.revoke();
      return "";
    }
    if (cached.size >= MAX_CACHED_IMAGES) {
      const oldest = cached.keys().next().value;
      if (oldest) {
        cached.get(oldest)?.revoke();
        cached.delete(oldest);
      }
    }
    cached.set(id, asset);
    return asset.url;
  }).finally(() => {
    if (pending.get(id) === task) pending.delete(id);
  });
  pending.set(id, task);
  return task;
}
