/** Valida a identidade do cache da mesma conta autenticada. */
export function isConfirmedStoreIdentity(
  cachedUserId: string | null | undefined,
  authenticatedUserId: string | null | undefined,
  authenticatedProfileId: string | null | undefined,
): boolean {
  if (!cachedUserId || cachedUserId === "unknown" ||
      !authenticatedUserId || authenticatedUserId === "unknown") {
    return false;
  }

  return cachedUserId === authenticatedUserId ||
    Boolean(authenticatedProfileId &&
      cachedUserId === authenticatedProfileId);
}
