import { useEffect, useState } from "react";
import { loadRemoteDocumentReviewCapabilities } from "@/integrations/backend/platform";

export function useDocumentReviewCapabilities(processId?: string, identityKey?: string) {
  const key = processId && identityKey ? processId + ":" + identityKey : "";
  const [snapshot, setSnapshot] = useState<{ key: string; ids: string[]; reason: string; ready: boolean }>({ key: "", ids: [], reason: "", ready: false });
  useEffect(() => {
    if (!processId || !key) return;
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (disposed || pending) return;
      pending = true;
      try {
        const result = await loadRemoteDocumentReviewCapabilities(processId);
        if (!disposed) setSnapshot({ key, ids: Array.isArray(result.document_ids) ? result.document_ids : [], reason: result.reason || "", ready: true });
      } catch {
        if (!disposed) setSnapshot({ key, ids: [], reason: "Não foi possível confirmar a autorização. Tente novamente após a sincronização.", ready: true });
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("sigapro:data-changed", refresh);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("sigapro:data-changed", refresh); };
  }, [key, processId]);
  return {
    allows: (documentId: string) => snapshot.key === key && snapshot.ready && snapshot.ids.includes(documentId),
    reason: snapshot.key === key && snapshot.ready ? snapshot.reason : "Verificando autorização técnica no banco...",
  };
}
