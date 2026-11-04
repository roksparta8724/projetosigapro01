import { useEffect, useState } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listLawRegistry } from "@/integrations/backend/urbanLegislationRegistryClient";
import {
  listUrbanMatrixBatches, readUrbanMatrixBatch, listUrbanMatrixReadingAudit,
  listUrbanQuadroIIWorkspace, listUrbanRegulations, listUrbanLegalMatrixImports,
  listUrbanVerifiedEvidenceScopes,
} from "@/integrations/backend/urbanPrecheckClient";
import {
  assessUrbanAiReadiness, OTHER_REQUIRED_URBAN_FIELDS,
  type MunicipalLegalFiles, type UrbanReadinessSummary,
} from "@/lib/urbanAiReadiness";

/** Read-only, live, tenant-scoped audit. Never writes or activates a law. */
export function UrbanAiReadinessPanel({
  municipalityId, documents, onOpenQuadro,
}: {
  municipalityId: string;
  documents: MunicipalLegalFiles;
  onOpenQuadro: (quadro: "I" | "II") => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<UrbanReadinessSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError("");
    if (!municipalityId) return;
    setLoading(true);
    void (async () => {
      const [batches, audit, quadroII, imports, evidences, regulations, registry] =
        await Promise.all([
          listUrbanMatrixBatches(municipalityId),
          listUrbanMatrixReadingAudit(municipalityId),
          listUrbanQuadroIIWorkspace(municipalityId),
          listUrbanLegalMatrixImports(municipalityId),
          listUrbanVerifiedEvidenceScopes(municipalityId),
          listUrbanRegulations(municipalityId),
          listLawRegistry(municipalityId),
        ]);
      const activeBatch = batches.find((batch) => !audit.batch_events.some(
        (event) => event.batch_id === batch.id && event.action === "archive")) ?? null;
      const source = activeBatch
        ? await readUrbanMatrixBatch(municipalityId, activeBatch.id) : null;
      return assessUrbanAiReadiness({
        files: documents, source, audits: audit.row_reviews,
        quadroII, matrixImports: imports, verifiedEvidence: evidences,
        regulations, versionedLawCount: registry.total,
      });
    })().then((next) => {
      if (!cancelled) setReport(next);
    }).catch((cause: unknown) => {
      if (!cancelled) setError("Não foi possível consultar todas as fontes do Neon: " +
        String((cause as Error)?.message || cause));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // The document labels are a snapshot. Refresh explicitly or switch tenant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipalityId, refresh]);

  return (
    <section data-urban-ai-readiness="true"
      className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-sky-200 bg-white p-4 text-slate-900 shadow-sm dark:border-sky-700 dark:bg-slate-950 dark:text-white md:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-950 dark:text-white">
            <BookOpenCheck className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            Auditoria de prontidão da IA — dados reais da Prefeitura
          </h4>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700 dark:text-slate-200">
            Fontes, Quadros I e II, vigência, versões e evidências jurídicas.
            A transcrição de uma página não constitui aprovação legal.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}>
          <RefreshCcw className="mr-2 h-4 w-4" /> Atualizar auditoria
        </Button>
      </div>
      {loading ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <Loader2 className="h-4 w-4 animate-spin" /> Consultando o banco municipal...
      </p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-950 dark:border-rose-500/50 dark:bg-slate-900 dark:text-rose-200">
        {error} Nenhuma conferência pode ser dada como concluída com consultas incompletas.
      </p> : null}
      {report && !error && !loading ? <>
        <div data-urban-ai-readiness-summary="true"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-100">
          <strong className="flex items-center gap-2">
            {report.readyForHumanAssistedPrecheck ?
              <CheckCircle2 className="h-4 w-4" /> :
              <AlertTriangle className="h-4 w-4" />}
            {report.readyForHumanAssistedPrecheck ?
              "Base apta para pré-conferência assistida e supervisionada" :
              "Base legal incompleta — sem liberação automática"}
          </strong>
          <p className="mt-1 text-xs leading-5">
            Quadro I: {report.reading.verified}/{report.reading.total} leituras conferidas.
            {" "}Ressalvas: {report.reading.needsCorrection}.
            {" "}Quadro II: {report.quadroII.draftEntries} rascunhos.
            {" "}Regras reais ativas: {report.counts.officialActive}.
          </p>
        </div>
        <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
          {report.checks.map((check) => <article key={check.code}
            data-urban-ai-readiness-step={check.code} data-ready={String(check.passed)}
            className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <div className="flex min-w-0 items-start gap-2">
              {check.passed ?
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" /> :
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />}
              <div className="min-w-0 flex-1">
                <p className="break-words text-xs font-extrabold text-slate-950 dark:text-white">
                  {check.title} — {check.passed ? "Registrado" : "Pendente"}
                </p>
                <p className="mt-1 break-words text-xs leading-5 text-slate-700 dark:text-slate-200">
                  {check.detail}
                </p>
                {check.quadro ? <button type="button"
                  className="mt-2 min-h-8 text-xs font-bold text-sky-800 underline underline-offset-2 dark:text-sky-300"
                  onClick={() => onOpenQuadro(check.quadro!)}>
                  Abrir Quadro {check.quadro}
                </button> : null}
              </div>
            </div>
          </article>)}
        </div>
        <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer text-xs font-bold text-slate-950 dark:text-white">
            Parâmetros jurídicos condicionais ainda fora da comparação numérica automática
          </summary>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
            {OTHER_REQUIRED_URBAN_FIELDS.map((field) => <li key={field}>• {field}</li>)}
          </ul>
        </details>
        <p className="mt-3 text-xs font-semibold leading-5 text-slate-700 dark:text-slate-200">
          O leitor geométrico automático de plantas arquitetônicas ainda não foi homologado.
          Na pré-conferência, o analista deve informar e conferir cotas e evidências do projeto.
          A IA nunca substitui o responsável pela análise.
        </p>
      </> : null}
    </section>
  );
}
