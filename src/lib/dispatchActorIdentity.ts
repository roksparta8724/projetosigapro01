import type { DispatchItem, SessionUser } from "@/lib/platform";

/**
 * Resolve a dispatch signer using only explicit, recorded identity data.
 * Never substitute the assigned analyst, process owner or current viewer:
 * these may not be the person who initiated the dispatch.
 */
export function resolveProcessDispatchAuthor(
  dispatch: Pick<DispatchItem, "requestedBy" | "requestedByProfileId">,
  directory: ReadonlyArray<Pick<SessionUser, "id" | "name">> = [],
): string | null {
  const profileId = String(dispatch.requestedByProfileId ?? "").trim();
  if (profileId) {
    const matchingUser = directory.find((user) => user.id === profileId);
    const directoryName = String(matchingUser?.name ?? "").trim();
    if (directoryName && !/^(usu[aá]rio|sistema|autor n[aã]o identificado)$/i.test(directoryName)) {
      return directoryName;
    }
  }

  const storedName = String(dispatch.requestedBy ?? "").trim();
  if (storedName && !/^(usu[aá]rio|sistema|autor n[aã]o identificado)$/i.test(storedName)) {
    return storedName;
  }

  return null;
}
