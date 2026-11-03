import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ChevronDown, FileCheck2, FileWarning, Loader2 } from "lucide-react";
import {
  listUrbanMatrixBatches, readUrbanMatrixBatch,
  type UrbanMatrixBatchDetail, type UrbanMatrixBatchSummary,
} from "@/integrations/backend/urbanPrecheckClient";
import { calculateUrbanMatrixBatchProgress, describeUrbanMatrixRow, formatUrbanMatrixSourceValue } from "@/lib/urbanLegalMatrixReview";

/** Tenant-scoped import inventory. Extracted data never activates a zoning rule. */
export function UrbanLegalMatrixReviewPanel({
  municipalityId, canView,
}: { municipalityId: string; canView: boolean }) {
  const [batches, setBatches] = useState<UrbanMatrixBatchSummary[]>([]);
  const [selected, setSelected] = useState<UrbanMatrixBatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    setBatches([]);
    setSelected(null);
    setError("");
    setShowAll(false);
    if (!municipalityId || !canView) return () => { active = false; };
    setLoading(true);
    void listUrbanMatrixBatches(municipalityId)
      .then((rows) => { if (active) setBatches(rows); })
      .catch((err: unknown) => { if (active) setError(String((err as Error)?.message || err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [municipalityId, canView]);

  const openBatch = async (batchId: string) => {
    if (detailLoading || !municipalityId || !canView) return;
    if (selected?.id === batchId) { setSelected(null); return; }
    setDetailLoading(true);
    setError("");
    setSelected(null);
    try {
      const detail = await readUrbanMatrixBatch(municipalityId, batchId);
      if (!detail) throw new Error("Lote pendente não encontrado no escopo municipal.");
      setSelected(detail);
      setShowAll(false);
    } catch (err) { setError(String((err as Error)?.message || err)); }
    finally { setDetailLoading(false); }
  };
  const progress = useMemo(() => selected ? calculateUrbanMatrixBatchProgress(selected) : null, [selected]);
  const displayedRows = useMemo(() => {
    if (!progress) return [];
    return showAll ? progress.rows : progress.rows.filter((row) => !row.readingReviewed);
  }, [progress, showAll]);

  if (!canView) return null;

  return (
    <section data-urban-matrix-review="true" className="min-w-0 rounded-2xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-700 dark:bg-slate-900 md:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-800 dark:text-sky-300" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-extrabold text-slate-950 dark:text-white">Matriz assistida — importação dos limites legais</h4>
          <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-300">
            Os números extraídos são rascunhos para comparação com a lei. Conferência de leitura não comprova vigência nem autoriza usar o parâmetro na análise técnica.
          </p>
        </div>
      </div>
      {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Consultando lotes importados...</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p> : null}
      {!loading && batches.length === 0 && !error ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">
          Nenhum lote de parâmetros legais ainda foi salvo nesta prefeitura.
        </p>
      ) : null}
      <div className="mt-3 space-y-2">
        {batches.map((batch) => (
          <button key={batch.id} type="button" onClick={() => void openBatch(batch.id)}
            aria-expanded={selected?.id === batch.id}
            className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-slate-700 dark:bg-slate-950">
            <span className="min-w-0">
              <strong className="block break-words text-sm text-slate-950 dark:text-white">{batch.document_title} · versão {batch.version}</strong>
              <span className="block text-xs text-slate-600 dark:text-slate-300">
                {batch.reviewed_rows} de {batch.total_rows} leituras conferidas · {Math.max(0,batch.total_rows - batch.reviewed_rows)} pendentes
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-800 dark:text-sky-300">
              {selected?.id === batch.id ? "Ocultar" : "Conferir pendências"} <ChevronDown className="h-4 w-4" />
            </span>
          </button>
        ))}
      </div>
      {detailLoading ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Carregando páginas e zonas...</p> : null}
      {selected && progress ? (
        <div className="mt-4 space-y-3" data-urban-matrix-progress="true">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-950">
              <p className="text-xs text-slate-600 dark:text-slate-300">Linhas extraídas</p>
              <p className="text-xl font-black text-slate-950 dark:text-white">{progress.total}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-950">
              <p className="text-xs text-slate-600 dark:text-slate-300">Leitura conferida</p>
              <p className="text-xl font-black text-emerald-700">{progress.reviewed}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-3 dark:bg-slate-950">
              <p className="text-xs text-slate-600 dark:text-slate-300">Aguardando conferência</p>
              <p className="text-xl font-black text-amber-800">{progress.pending}</p>
            </div>
          </div>
          <div aria-label="Progresso da revisão de leitura" className="h-2.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-sky-700" style={{ width: `${progress.percentage}%` }} />
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            <FileWarning className="mr-1 inline h-4 w-4" />
            Sem vigência comprovada: não ativar. Quadro II (categorias de uso, localização e vagas) ainda não está transcrito neste lote. Conferir alterações posteriores, recuos condicionais e fonte oficial.
          </div>
          <p className="break-all text-[11px] text-slate-500">
            Fonte: {selected.document_title} · SHA-256 {selected.document_sha256}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {showAll ? "Todas as linhas da importação" : "Somente linhas pendentes"}
            </p>
            <button type="button" onClick={() => setShowAll((current) => !current)}
              className="text-xs font-bold text-sky-800 underline underline-offset-4 dark:text-sky-300">
              {showAll ? "Mostrar somente pendentes" : "Ver todas as linhas"}
            </button>
          </div>
          {displayedRows.length === 0 ? (
            <p className="rounded-xl bg-white p-3 text-xs text-slate-700">Leitura conferida. A validação legal e a vigência continuam obrigatórias.</p>
          ) : (
            <div className="space-y-2">
              {displayedRows.map((entry) => {
                const row = describeUrbanMatrixRow(entry.source);
                return (
                  <details key={entry.index} data-urban-matrix-row="true"
                    className="group min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                      {entry.readingReviewed ? <FileCheck2 className="h-4 w-4 text-emerald-600" /> : <FileWarning className="h-4 w-4 text-amber-700" />}
                      <strong className="min-w-0 flex-1 break-words text-slate-950 dark:text-white">
                        {row.zone} · {row.usage}
                      </strong>
                      <span className="text-xs text-slate-500">Quadro {row.quadro} · pág. {row.page}</span>
                      <span className="text-xs font-semibold text-sky-800 dark:text-sky-300">Ver índices <ChevronDown className="inline h-3.5 w-3.5" /></span>
                    </summary>
                    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs text-slate-700 dark:text-slate-200">
                      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                        {row.metrics.map((metric) => (
                          <p key={metric.label} className="min-w-0 break-words">
                            <span className="block text-slate-500 dark:text-slate-400">{metric.label}</span>
                            <strong className="font-semibold">{formatUrbanMatrixSourceValue(metric.value)}</strong>
                          </p>
                        ))}
                      </div>
                      {row.notes ? <p className="rounded-lg bg-amber-50 p-2 leading-5 text-amber-950">Observação: {row.notes}</p> : null}
                      {row.pending ? <p className="rounded-lg bg-rose-50 p-2 leading-5 text-rose-900">Pendente: {row.pending}</p> : null}
                      <p className="font-semibold text-amber-800">
                        {entry.readingReviewed ? "Leitura conferida; vigência não comprovada." : "Aguardando revisão da leitura e das exceções."}
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
