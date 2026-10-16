import { useEffect, useState } from "react";
import {
  CONSTRUCTION_PERMIT_EVENT,
  readLocalConstructionPermit,
  writeLocalConstructionPermit,
  type ConstructionPermitRecord,
} from "@/lib/constructionPermit";
import { getOfficialConstructionPermit } from "@/integrations/permits/constructionPermitClient";

const PERMIT_STATUS_RANK: Record<ConstructionPermitRecord["status"], number> = {
  rascunho: 0,
  aguardando_diretor: 2,
  assinatura_manual: 2,
  emitido: 3,
};

export function mergeConstructionPermitMonotonic(
  local: ConstructionPermitRecord | null,
  official: ConstructionPermitRecord,
): ConstructionPermitRecord {
  if (!local) return official;

  const localRank = PERMIT_STATUS_RANK[local.status] ?? 0;
  const officialRank = PERMIT_STATUS_RANK[official.status] ?? 0;

  // O banco remoto pode estar alguns instantes atrás do estado que acabou de ser
  // preparado no navegador. O estágio do Alvará é monotônico: uma leitura tardia
  // nunca pode transformar assinatura manual / Diretoria em rascunho.
  const primary = localRank > officialRank ? local : official;
  const secondary = primary === local ? official : local;

  return {
    ...secondary,
    ...primary,
    formData: primary.formData ?? secondary.formData,
    analystSignature: primary.analystSignature ?? secondary.analystSignature,
    directorSignature: primary.directorSignature ?? secondary.directorSignature,
    secretarySignature: primary.secretarySignature ?? secondary.secretarySignature,
    signatureMode: primary.signatureMode ?? secondary.signatureMode,
    directorRequestedAt:
      primary.directorRequestedAt ?? secondary.directorRequestedAt,
    manualPdfPreparedAt:
      primary.manualPdfPreparedAt ?? secondary.manualPdfPreparedAt,
    issuedAt: primary.issuedAt ?? secondary.issuedAt,
    preparedAt: primary.preparedAt || secondary.preparedAt,
    updatedAt:
      new Date(primary.updatedAt || primary.preparedAt).getTime() >=
      new Date(secondary.updatedAt || secondary.preparedAt).getTime()
        ? primary.updatedAt || primary.preparedAt
        : secondary.updatedAt || secondary.preparedAt,
  };
}

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
        const latestLocal =
          readLocalConstructionPermit(municipalityId, processId) ?? local;
        const merged = mergeConstructionPermitMonotonic(latestLocal, official);
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
