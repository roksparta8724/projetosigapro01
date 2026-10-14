import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { parseMarker, serializeMarker } from "@/lib/platform";

type DocumentMarkerState = Record<string, string[]>;

const STORAGE_PREFIX = "sigapro-document-markers";
const EVENT_NAME = "sigapro-document-markers-updated";

function storageKey(ownerId: string) {
  return `${STORAGE_PREFIX}:${ownerId}`;
}

function itemKey(processId: string, documentId: string) {
  return `${processId}::${documentId}`;
}

function safeParse(raw: string | null): DocumentMarkerState {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [
          key,
          (value as unknown[]).filter((item): item is string => typeof item === "string"),
        ]),
    );
  } catch {
    return {};
  }
}

export function useDocumentMarkerAssignments() {
  const { authenticatedProfileId, authenticatedUserId } = useAuthGateway();
  const ownerId = authenticatedProfileId || authenticatedUserId || "";
  const [state, setState] = useState<DocumentMarkerState>({});

  useEffect(() => {
    if (typeof window === "undefined" || !ownerId) {
      setState({});
      return;
    }
    setState(safeParse(window.localStorage.getItem(storageKey(ownerId))));
  }, [ownerId]);

  useEffect(() => {
    if (typeof window === "undefined" || !ownerId) return;

    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerId?: string; state?: DocumentMarkerState }>).detail;
      if (!detail || detail.ownerId !== ownerId || !detail.state) return;
      setState(detail.state);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey(ownerId)) return;
      setState(safeParse(event.newValue));
    };

    window.addEventListener(EVENT_NAME, handleCustom as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, handleCustom as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, [ownerId]);

  const commit = useCallback(
    (updater: (current: DocumentMarkerState) => DocumentMarkerState) => {
      setState((current) => {
        const next = updater(current);
        if (typeof window !== "undefined" && ownerId) {
          window.localStorage.setItem(storageKey(ownerId), JSON.stringify(next));
          window.dispatchEvent(
            new CustomEvent(EVENT_NAME, {
              detail: { ownerId, state: next },
            }),
          );
        }
        return next;
      });
    },
    [ownerId],
  );

  const getTags = useCallback(
    (processId: string, documentId: string) => state[itemKey(processId, documentId)] ?? [],
    [state],
  );

  const addMarker = useCallback(
    async (processId: string, documentId: string, label: string, color: string) => {
      const normalized = label.trim();
      if (!normalized) return;
      const serialized = serializeMarker(normalized, color);

      commit((current) => {
        const key = itemKey(processId, documentId);
        const previous = current[key] ?? [];
        const nextTags = previous.filter(
          (tag) => parseMarker(tag).label.trim().toLowerCase() !== normalized.toLowerCase(),
        );
        return { ...current, [key]: [...nextTags, serialized] };
      });
    },
    [commit],
  );

  const removeMarker = useCallback(
    async (processId: string, documentId: string, markerTag: string) => {
      const normalized = parseMarker(markerTag).label.trim().toLowerCase();
      commit((current) => {
        const key = itemKey(processId, documentId);
        const previous = current[key] ?? [];
        const nextTags = previous.filter(
          (tag) => parseMarker(tag).label.trim().toLowerCase() !== normalized,
        );
        if (nextTags.length === 0) {
          const { [key]: _removed, ...rest } = current;
          return rest;
        }
        return { ...current, [key]: nextTags };
      });
    },
    [commit],
  );

  return useMemo(
    () => ({
      getTags,
      addMarker,
      removeMarker,
    }),
    [addMarker, getTags, removeMarker],
  );
}
