/**
 * A tenant membership grants visibility, not authority to mutate files.
 * Restrict process-attachment writes to the authenticated owning profile,
 * excluding municipality administrators and platform master roles.
 * Finance/DAM original, legislation and other R2 operations have their own
 * independent authorization and must never inherit this decision.
 */
import { callDataApiRpc, type ApiReq } from "./municipal-storage.js";

const UUID = "[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
const PROCESS_ATTACHMENT = new RegExp(
  "^municipalities/(" + UUID + ")/(?:protocols|habite-se|attachments|analysis|documents|comunique-se|qa-arquitetura)/(" +
  UUID + ")/(" + UUID + ")-[A-Za-z0-9._-]{1,180}$", "i",
);
export function parseProcessAttachmentWriteKey(objectKey: string) {
  const match = PROCESS_ATTACHMENT.exec(objectKey);
  if (!match || objectKey.includes("..") || objectKey.length > 500) return null;
  return { municipalityId: match[1].toLowerCase(), ownerProfileId: match[2].toLowerCase() };
}

export type ProcessAttachmentGrant =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; code: string };

export async function authorizeProcessAttachmentWrite(
  req: ApiReq, objectKey: string,
): Promise<ProcessAttachmentGrant> {
  const key = parseProcessAttachmentWriteKey(objectKey);
  if (!key) return { ok: false, status: 403, code: "PROCESS_ATTACHMENT_PATH_DENIED" };
  const [identity, membership, isAdmin, isMaster] = await Promise.all([
    callDataApiRpc<unknown>(req, "current_profile_id", {}),
    callDataApiRpc<unknown>(req, "has_tenant_access", { target_tenant: key.municipalityId }),
    callDataApiRpc<unknown>(req, "is_municipality_admin", {}),
    callDataApiRpc<unknown>(req, "is_master", {}),
  ]);
  if (!identity.ok || !membership.ok || !isAdmin.ok || !isMaster.ok) {
    return { ok: false, status: 503, code: "PROCESS_ATTACHMENT_GRANT_UNAVAILABLE" };
  }
  if (String(identity.payload || "").toLowerCase() !== key.ownerProfileId ||
      membership.payload !== true || isAdmin.payload !== false ||
      isMaster.payload !== false) {
    return { ok: false, status: 403, code: "PROCESS_ATTACHMENT_ROLE_OR_OWNER_DENIED" };
  }
  return { ok: true };
}
