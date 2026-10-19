const DOCUMENT_WORKSPACE_ACCESS_PREFIX = "sigapro.document-workspace-access.v1:";
const DOCUMENT_WORKSPACE_ACCESS_TTL_MS = 90_000;

type CachedDocumentWorkspaceAccess = {
  url: string;
  expiresAt: number;
};

function accessKey(processId: string, documentId: string) {
  return `${DOCUMENT_WORKSPACE_ACCESS_PREFIX}${processId}:${documentId}`;
}

export function cacheDocumentWorkspaceAccessUrl(
  processId: string,
  documentId: string,
  url: string,
) {
  if (typeof window === "undefined") return;
  const normalized = url.trim();
  if (!processId || !documentId || !normalized) return;

  const payload: CachedDocumentWorkspaceAccess = {
    url: normalized,
    expiresAt: Date.now() + DOCUMENT_WORKSPACE_ACCESS_TTL_MS,
  };

  window.localStorage.setItem(
    accessKey(processId, documentId),
    JSON.stringify(payload),
  );
}

export function consumeDocumentWorkspaceAccessUrl(
  processId?: string,
  documentId?: string,
) {
  if (typeof window === "undefined" || !processId || !documentId) return "";

  const key = accessKey(processId, documentId);
  const raw = window.localStorage.getItem(key);
  if (!raw) return "";

  window.localStorage.removeItem(key);

  try {
    const parsed = JSON.parse(raw) as Partial<CachedDocumentWorkspaceAccess>;
    if (
      typeof parsed.url !== "string" ||
      !parsed.url.trim() ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return "";
    }
    return parsed.url.trim();
  } catch {
    return "";
  }
}
