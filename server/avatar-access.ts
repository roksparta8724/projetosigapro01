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

  const master = await callDataApiRpc<boolean>(req, "is_master", {});
  if (master.ok && master.payload === true) return { ok: true };
  if (!avatar.municipalityId) return DENIED;

  const admin = await callDataApiRpc<boolean>(req, "is_municipality_admin", {});
  if (!admin.ok || admin.payload !== true) return DENIED;
  const tenant = await callDataApiRpc<boolean>(req, "has_tenant_access", {
    target_tenant: avatar.municipalityId,
  });
  if (!tenant.ok || tenant.payload !== true) return DENIED;
  return { ok: true };
}

/**
 * Strict only on the isolated, explicit QA Preview branch. Other environments
 * retain the legacy image URL during controlled rollout, never an implicit
 * switch to production. Production activation needs separate browser QA.
 */
export function enforceAuthenticatedAvatarRead(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === "fix/qa-triagem-analise-pagamento-20261101";
}
