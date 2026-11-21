import { callDataApiRpc, readBearer, type ApiReq } from "./municipal-storage.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM_AVATAR = /^platform\/profiles\/avatars\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)$/i;
const MUNICIPAL_AVATAR = /^municipalities\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/profiles\/avatars\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)$/i;

export function parsePrivateAvatarObjectKey(key: string): {
  profileId: string;
  municipalityId: string | null;
} | null {
  const platform = PLATFORM_AVATAR.exec(key);
  if (platform) return { profileId: platform[1], municipalityId: null };
  const tenant = MUNICIPAL_AVATAR.exec(key);
  return tenant ? { profileId: tenant[2], municipalityId: tenant[1] } : null;
}

export function isAvatarStoragePath(key: string): boolean {
  return /\/profiles\/avatars\//i.test(key);
}

type AvatarReadAccess =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 403 | 503; error: string };

const DENIED: AvatarReadAccess = {
  ok: false, status: 403, error: "A foto não está disponível para esta conta.",
};

/**
 * Reading a private profile image is not equivalent to membership in the
 * municipality. The owner may read their own image; Master may administer
 * images; a tenant administrator may inspect profiles of their own city.
 * No public or anonymous caller may create a signed URL for an avatar.
 */
export async function authorizePrivateAvatarRead(
  req: ApiReq,
  objectKey: string,
): Promise<AvatarReadAccess> {
  const avatar = parsePrivateAvatarObjectKey(objectKey);
  if (!avatar) return { ok: false, status: 400, error: "Referência de foto inválida." };
  if (!readBearer(req))
    return { ok: false, status: 401, error: "Autenticação necessária para abrir a foto." };

  const current = await callDataApiRpc<unknown>(req, "current_profile_id", {});
  if (!current.ok)
    return { ok: false, status: current.status === 401 ? 401 : 503,
      error: "Não foi possível verificar a sessão." };
  const currentId = typeof current.payload === "string" ? current.payload : "";
  if (!UUID.test(currentId)) return DENIED;
  if (currentId.toLowerCase() === avatar.profileId.toLowerCase()) {
    // Reading one's own avatar is allowed even if the municipal link has ended.
    return { ok: true };
  }

  if (!avatar.municipalityId) {
    const master = await callDataApiRpc<boolean>(req, "is_master", {});
    return master.ok && master.payload === true ? { ok: true } : DENIED;
  }

  // These read-only checks are independent. On a municipal users page the
  // previous serial sequence (is_master -> is_admin -> membership) multiplied
  // Neon round-trips for every private photo. Parallel calls reduce latency
  // without relaxing either condition required for a municipal administrator.
  const [masterResult, adminResult, tenantResult] = await Promise.allSettled([
    callDataApiRpc<boolean>(req, "is_master", {}),
    callDataApiRpc<boolean>(req, "is_municipality_admin", {}),
    callDataApiRpc<boolean>(req, "has_tenant_access", {
      target_tenant: avatar.municipalityId,
    }),
  ]);
  // One failing role lookup never grants access. A verified Master can still
  // read its permitted photo even if an unrelated tenant RPC is unavailable.
  const master = masterResult.status === "fulfilled" ? masterResult.value : null;
  const admin = adminResult.status === "fulfilled" ? adminResult.value : null;
  const tenant = tenantResult.status === "fulfilled" ? tenantResult.value : null;
  if (master?.ok && master.payload === true) return { ok: true };
  if (admin?.ok && admin.payload === true && tenant?.ok && tenant.payload === true)
    return { ok: true };
  return DENIED;
}

/**
 * SECURE BY DEFAULT: private R2 profile photos always require a verified
 * Bearer identity and role/municipality ACL, including previews, production
 * and local development. New branches MUST NOT silently bypass the check.
 * The server's Data API selection independently fails closed if no matching
 * environment is configured.
 */
export function enforceAuthenticatedAvatarRead(_env: NodeJS.ProcessEnv = process.env): boolean {
  return true;
}
