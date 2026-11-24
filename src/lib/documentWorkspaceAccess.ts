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

// The server caps private document credentials at 900 seconds. Refresh before
// that deadline, not after the PDF viewer has started failing range requests.
export const PRIVATE_DOCUMENT_ACCESS_SECONDS = 900;
export const PRIVATE_DOCUMENT_RENEW_AFTER_MS = 12 * 60_000;

export function maintainAuthorizedDocumentAccess(input: {
  request: () => Promise<string>;
  onAccess: (url: string) => void;
  onError: (error: unknown) => void;
}) {
  let disposed = false;
  let pending = false;
  let nextRefresh = 0;
  let timer: number | undefined;

  const refresh = async () => {
    if (disposed || pending) return;
    pending = true;
    const requestedAt = Date.now();
    try {
      const url = await input.request();
      if (!url) throw new Error("Não foi possível confirmar o acesso seguro ao documento.");
      if (disposed) return;
      nextRefresh = requestedAt + PRIVATE_DOCUMENT_RENEW_AFTER_MS;
      input.onAccess(url);
    } catch (error) {
      if (disposed) return;
      // Never retain a stale credential after a failed authorization check.
      nextRefresh = Date.now() + 60_000;
      input.onError(error);
    } finally {
      pending = false;
      if (!disposed) {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = window.setTimeout(() => void refresh(), Math.max(0, nextRefresh - Date.now()));
      }
    }
  };

  const resume = () => {
    if (window.document.visibilityState !== "hidden" && Date.now() >= nextRefresh) void refresh();
  };
  window.addEventListener("focus", resume);
  window.document.addEventListener("visibilitychange", resume);
  void refresh();
  return () => {
    disposed = true;
    if (timer !== undefined) window.clearTimeout(timer);
    window.removeEventListener("focus", resume);
    window.document.removeEventListener("visibilitychange", resume);
  };
}
