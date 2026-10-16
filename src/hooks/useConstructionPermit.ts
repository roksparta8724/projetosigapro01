import { useEffect, useState } from "react";
import {
  CONSTRUCTION_PERMIT_EVENT,
  readLocalConstructionPermit,
  writeLocalConstructionPermit,
  type ConstructionPermitRecord,
} from "@/lib/constructionPermit";
import { getOfficialConstructionPermit } from "@/integrations/permits/constructionPermitClient";

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
    const local = readLocalConstructionPermit(municipalityId, processId);
    setPermit(local);

    let active = true;
    void getOfficialConstructionPermit(processId)
      .then((official) => {
        if (!active || !official) return;
        const merged: ConstructionPermitRecord = {
          ...official,
          directorSignature: local?.directorSignature,
          secretarySignature: local?.secretarySignature,
          issuedAt: local?.issuedAt,
        };
        writeLocalConstructionPermit(merged);
        setPermit(merged);
      })
      .catch((error) => {
        if (!active) return;
        console.error("[SIGAPRO][Alvará] Falha ao sincronizar o resumo oficial.", error);
      });

    if (typeof window === "undefined") {
      return () => {
        active = false;
      };
    }
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
    return () => {
      active = false;
      window.removeEventListener(
        CONSTRUCTION_PERMIT_EVENT,
        sync as EventListener,
      );
    };
  }, [municipalityId, processId]);

  return permit;
}
