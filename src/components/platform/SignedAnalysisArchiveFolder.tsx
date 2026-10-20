import { useEffect, useState } from "react";
import { FileCheck2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProcessRecord } from "@/lib/platform";
import { getProcessArtifactVersionHistory, getProcessArtifactWithdrawalHistory, type ArtifactVersionHistoryEntry, type ArtifactWithdrawalEvent } from "@/integrations/esign/artifactClient";
import { isSignedAnalysisArchiveDocument, isSignedAnalysisVersionArchived } from "@/lib/signedAnalysisArchive";

export function SignedAnalysisArchiveFolder({ process, onOpenPdf, onOpenAnalysis }: {
  process: ProcessRecord;
  onOpenPdf: (id: string) => void;
  onOpenAnalysis: () => void;
}) {
  const [versions, setVersions] = useState<ArtifactVersionHistoryEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<ArtifactWithdrawalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setVersions([]);
    setWithdrawals([]);
    setError("");
    setLoading(true);
    Promise.all([
      getProcessArtifactVersionHistory(process.id, "urban-analysis-checklist"),
      getProcessArtifactWithdrawalHistory(process.id, "urban-analysis-checklist"),
    ])
      .then(([data, withdrawalEvents]) => {
        if (!active) return;
        setVersions(data);
        setWithdrawals(withdrawalEvents);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Histórico indisponível."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [process.id]);
  const archived = process.documents.filter(isSignedAnalysisArchiveDocument);
  const evidenceOnly = versions.filter((v) => !v.verification_code ||
    !isSignedAnalysisVersionArchived(process.documents, v.artifact_version, v.verification_code));
  return (
    <section data-signed-documents-folder="true" className="rounded-[22px] border border-sky-200 bg-sky-50/50 p-5 shadow-sm dark:border-sky-500/30 dark:bg-sky-950/20">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><FileCheck2 className="h-6 w-6 text-sky-700 dark:text-sky-300" />
          <div><h3 className="text-base font-extrabold text-slate-950 dark:text-white">Documentos assinados</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">PDFs permanentes e evidências oficiais deste processo.</p></div>
        </div>
        <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-bold text-sky-800 dark:border-sky-500/30 dark:bg-slate-900 dark:text-sky-200">{archived.length} PDF(s) arquivado(s)</span>
      </header>
      <div className="mt-4 space-y-2">
        {archived.map((doc) => (
          <div data-signed-pdf-archived="true" key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white p-3 dark:border-emerald-500/30 dark:bg-slate-900">
            <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{doc.label}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">PDF arquivado no armazenamento institucional.</p></div>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenPdf(doc.id)}>Abrir PDF assinado</Button>
          </div>
        ))}
        {loading && <p className="text-xs text-slate-600 dark:text-slate-300">Consultando assinaturas registradas...</p>}
        {error && <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">Não foi possível consultar versões assinadas: {error}</p>}
        {evidenceOnly.map((version) => (
          <div data-signed-evidence-only="true" key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-950/20">
            <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"><History className="h-4 w-4" /> Assinatura registrada • versão {version.artifact_version}</p>
              <p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-300">Código {version.verification_code || "indisponível"} — o PDF histórico original não foi arquivado; a assinatura permanece no banco.</p></div>
            <Button type="button" variant="outline" className="rounded-xl" onClick={onOpenAnalysis}>Consultar análise</Button>
          </div>
        ))}
        {withdrawals.length > 0 && (
          <div data-signed-document-withdrawal-history="true" className="space-y-2 rounded-xl border border-sky-200 bg-white p-4 dark:border-sky-500/30 dark:bg-slate-900">
            <p className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">Retiradas físicas registradas</p>
            {withdrawals.map((withdrawal) => (
              <div key={withdrawal.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-xs dark:border-slate-700">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Retirado por: {withdrawal.withdrawn_by_name}
                </p>
                <p className="text-slate-600 dark:text-slate-300" title={withdrawal.withdrawn_at_exact}>
                  {Number.isNaN(Date.parse(withdrawal.withdrawn_at_exact)) ? "Data indisponível" : new Date(withdrawal.withdrawn_at_exact).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
        )}
        {!loading && !error && !archived.length && !evidenceOnly.length &&
          <p className="text-sm text-slate-600 dark:text-slate-300">Nenhum PDF assinado ou registro de assinatura localizado.</p>}
      </div>
    </section>
  );
}
