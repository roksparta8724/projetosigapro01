import { useEffect, useState } from "react";
import {
  CONSTRUCTION_PERMIT_EVENT,
  readLocalConstructionPermit,
  type ConstructionPermitRecord,
} from "@/lib/constructionPermit";

export function useConstructionPermit(
  municipalityId: string | null | undefined,
  processId: string | null | undefined,
) {
  const [permit, setPermit] = useState<ConstructionPermitRecord | null>(() =>
    municipalityId && processId
      ? readLocalConstructionPermit(municipalityId, processId)
      : null,
  );

  useEffect(() => {
    if (!municipalityId || !processId) {
      setPermit(null);
      return;
    }
    setPermit(readLocalConstructionPermit(municipalityId, processId));

    if (typeof window === "undefined") return;
    const sync = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          municipalityId?: string;
          processId?: string;
          record?: ConstructionPermitRecord;
        }>
      ).detail;
      if (
        detail?.municipalityId !== municipalityId ||
        detail?.processId !== processId
      ) {
        return;
      }
      setPermit(
        detail.record ??
          readLocalConstructionPermit(municipalityId, processId),
      );
    };

    window.addEventListener(CONSTRUCTION_PERMIT_EVENT, sync as EventListener);
    return () =>
      window.removeEventListener(
        CONSTRUCTION_PERMIT_EVENT,
        sync as EventListener,
      );
  }, [municipalityId, processId]);

  return permit;
}
