import { useEffect, useMemo, useState } from "react";
import { Archive, BookOpenCheck, ChevronDown, ClipboardCheck, FileCheck2, FileWarning, Loader2, RotateCcw } from "lucide-react";
import {
  listUrbanMatrixBatches, readUrbanMatrixBatch, listUrbanMatrixReadingAudit,
  recordUrbanMatrixReadingAction,
  type UrbanMatrixBatchDetail, type UrbanMatrixBatchSummary,
  type UrbanMatrixReadingAudit, type UrbanMatrixReadingAction,
} from "@/integrations/backend/urbanPrecheckClient";
import { calculateUrbanMatrixBatchProgress, describeUrbanMatrixRow, formatUrbanMatrixSourceValue } from "@/lib/urbanLegalMatrixReview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_AUDIT: UrbanMatrixReadingAudit = { row_reviews: [], batch_events: [] };
type ReviewDecision = "reading_verified" | "needs_correction";

/** A transcricao assinada nao comprova vigencia nem ativa normas. */
export function UrbanLegalMatrixReviewPanel({
  municipalityId, canView,
}: { municipalityId: string; canView: boolean }) {
  const [batches, setBatches] = useState<UrbanMatrixBatchSummary[]>([]);
  const [selected, setSelected] = useState<UrbanMatrixBatchDetail | null>(null);
  const [audit, setAudit] = useState<UrbanMatrixReadingAudit>(EMPTY_AUDIT);
  const [auditAvailable, setAuditAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [reviewingIndex, setReviewingIndex] = useState<number | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>("reading_verified");
  const [reviewNote, setReviewNote] = useState("");
  const [pageConfirmed, setPageConfirmed] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [manageAction, setManageAction] = useState<"archive" | "restore">("archive");
  const [manageNote, setManageNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setBatches([]);
    setSelected(null);
    setAudit(EMPTY_AUDIT);
    setAuditAvailable(false);
    setError("");
    setNotice("");
    setShowArchived(false);
    setShowAll(false);
    setReviewingIndex(null);
    setManageId(null);
    if (!municipalityId || !canView) return () => { active = false; };
    setLoading(true);
    void Promise.allSettled([
      listUrbanMatrixBatches(municipalityId),
      listUrbanMatrixReadingAudit(municipalityId),
    ]).then(async ([batchResult, auditResult]) => {
      if (!active) return;
      if (batchResult.status === "fulfilled") setBatches(batchResult.value);
      else setError(String((batchResult.reason as Error)?.message || batchResult.reason));
      if (auditResult.status === "fulfilled") {
        setAudit(auditResult.value);
        setAuditAvailable(true);
      } else {
        setAuditAvailable(false);
        setNotice("A leitura dos lotes continua disponível. Os botões de revisão e arquivamento exigem a atualização de auditoria v2 no banco de homologação.");
      }
      // Keep the first active Quadro I source open by default so its 23
      // records never look removed when the administrator enters the page.
      if (batchResult.status === "fulfilled") {
        const latestEvents = auditResult.status === "fulfilled"
          ? auditResult.value.batch_events : [];
        const firstActive = batchResult.value.find((batch) =>
          latestEvents.find((event) => event.batch_id === batch.id)?.action !== "archive",
        );
        if (firstActive) {
          setDetailLoading(true);
          try {
            const detail = await readUrbanMatrixBatch(municipalityId, firstActive.id);
            if (active && detail) setSelected(detail);
          } catch (err) {
            if (active) setError(String((err as Error)?.message || err));
          } finally {
            if (active) setDetailLoading(false);
          }
        }
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [municipalityId, canView]);

  const batchEvent = (id: string) => audit.batch_events.find((event) => event.batch_id === id);
  const isArchived = (id: string) => batchEvent(id)?.action === "archive";
  const archivedCount = batches.filter((batch) => isArchived(batch.id)).length;
  const visibleBatches = batches.filter((batch) => isArchived(batch.id) === showArchived);

  const openBatch = async (batchId: string) => {
    if (detailLoading || saving || !municipalityId || !canView) return;
    if (selected?.id === batchId) { setSelected(null); return; }
    setDetailLoading(true);
    setError("");
    setSelected(null);
    setReviewingIndex(null);
    setManageId(null);
    try {
      const detail = await readUrbanMatrixBatch(municipalityId, batchId);
      if (!detail) throw new Error("Lote não encontrado no escopo municipal.");
      setSelected(detail);
      setShowAll(false);
    } catch (err) { setError(String((err as Error)?.message || err)); }
    finally { setDetailLoading(false); }
  };

  const progress = useMemo(
    () => selected ? calculateUrbanMatrixBatchProgress(selected, audit.row_reviews) : null,
    [selected, audit],
  );
  const displayedRows = useMemo(() => {
    if (!progress) return [];
    return showAll ? progress.rows : progress.rows.filter((row) => !row.readingReviewed);
  }, [progress, showAll]);

  const startReview = (index: number, existingNote?: string, hasReadingIssue = false) => {
    setReviewingIndex(index);
    setDecision(hasReadingIssue ? "needs_correction" : "reading_verified");
    setReviewNote(existingNote || "");
    setPageConfirmed(false);
    setError("");
    setNotice("");
  };

  const saveReview = async (index: number, page: number, hasReadingIssue: boolean) => {
    if (!selected || !auditAvailable || saving) return;
    if (decision === "reading_verified" && hasReadingIssue) {
      setError("Esta linha contém trecho ilegível ou duvidoso. Registre a divergência; não confirme números incertos.");
      return;
    }
    if (!pageConfirmed || reviewNote.trim().length < 20) {
      setError("Confira a página do PDF original e escreva uma observação com pelo menos 20 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await recordUrbanMatrixReadingAction(
        municipalityId, selected.id, selected.document_sha256, decision, index, page, reviewNote,
      );
      setAudit(await listUrbanMatrixReadingAudit(municipalityId));
      setReviewingIndex(null);
      setReviewNote("");
      setPageConfirmed(false);
      setNotice(decision === "reading_verified"
        ? "Leitura registrada e assinada no Neon. A vigência e a norma legal continuam pendentes."
        : "Divergência registrada. Esta linha permanece pendente até nova conferência.");
    } catch (err) { setError(String((err as Error)?.message || err)); }
    finally { setSaving(false); }
  };

  const beginManage = (batch: UrbanMatrixBatchSummary, action: "archive" | "restore") => {
    setManageId(batch.id);
    setManageAction(action);
    setManageNote("");
    setError("");
    setNotice("");
  };
  const saveManage = async (batch: UrbanMatrixBatchSummary) => {
    if (!auditAvailable || saving || manageNote.trim().length < 20) {
      setError("Informe o motivo com pelo menos 20 caracteres. O histórico será preservado.");
      return;
    }
    if (!window.confirm(manageAction === "archive"
      ? "Arquivar esta importação? O histórico, as conferências e o PDF oficial não serão excluídos. Confirma?"
      : "Restaurar esta importação para continuar a conferência?")) return;
    setSaving(true);
    setError("");
    try {
      await recordUrbanMatrixReadingAction(
        municipalityId, batch.id, batch.document_sha256,
        manageAction as UrbanMatrixReadingAction, null, null, manageNote,
      );
      setAudit(await listUrbanMatrixReadingAudit(municipalityId));
      setSelected(null);
      setManageId(null);
      setNotice(manageAction === "archive"
        ? "Importação arquivada sem apagar o histórico. Para trocar o PDF, use o acervo legal acima."
        : "Importação restaurada e disponível para conferência.");
    } catch (err) { setError(String((err as Error)?.message || err)); }
    finally { setSaving(false); }
  };

  if (!canView) return null;
  return (
    <section data-urban-matrix-review="true" className="min-w-0 rounded-2xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-700 dark:bg-slate-900 md:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-950 dark:text-white">
            <BookOpenCheck className="h-5 w-5 shrink-0 text-sky-800 dark:text-sky-300" />
            Quadro I — matriz de limites e índices urbanísticos
          </h4>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700 dark:text-slate-300">
            Etapa 1: confira a transcrição por página. Etapa 2: valide a norma, as exceções e a vigência em cadastro próprio.
            Conferir a leitura não ativa limites nem autoriza aprovação pela IA.
          </p>
        </div>
        <a href="#sigapro-legal-archive-upload" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-sky-300 bg-white px-4 py-2 text-xs font-bold text-sky-900 underline-offset-2 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:bg-slate-950 dark:text-sky-200">
          Substituir ou remover PDF oficial
        </a>
      </div>

      <div className="mt-3 rounded-xl border border-sky-200 bg-white p-3 text-xs leading-5 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
        <strong>Como funciona:</strong> o botão acima leva ao Acervo legal, onde é possível usar Substituir ou Excluir e depois Salvar arquivos oficiais.
        Essa operação modifica o documento vinculado à Prefeitura, mas não altera automaticamente os índices de uma importação anterior.
        Use Arquivar importação para retirar um lote antigo da fila sem apagar sua rastreabilidade.
      </div>

      {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Consultando lotes importados...</p> : null}
      {error ? <p role="alert" className="mt-3 break-words rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 break-words rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">{notice}</p> : null}
      {!loading && !error && batches.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">Nenhum lote de parâmetros legais ainda foi salvo nesta Prefeitura.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
          {showArchived ? "Importações arquivadas" : "Importações em conferência"}
        </p>
        {archivedCount > 0 ? (
          <button type="button" onClick={() => { setShowArchived((v) => !v); setSelected(null); setManageId(null); }}
            className="text-xs font-bold text-sky-800 underline underline-offset-4 dark:text-sky-300">
            {showArchived ? "Voltar aos lotes em conferência" : "Ver arquivados (" + archivedCount + ")"}
          </button>
        ) : null}
      </div>
      {!loading && batches.length > 0 && visibleBatches.length === 0 ? (
        <p className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
          Nenhum lote nesta situação. Alterações anteriores continuam preservadas.
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {visibleBatches.map((batch) => (
          <div key={batch.id} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <button type="button" onClick={() => void openBatch(batch.id)} aria-expanded={selected?.id === batch.id}
              className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 p-3 text-left hover:bg-sky-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:hover:bg-slate-800">
              <span className="min-w-0 flex-1">
                <strong className="block break-words text-sm text-slate-950 dark:text-white">{batch.document_title} · versão {batch.version}</strong>
                <span className="block text-xs text-slate-600 dark:text-slate-300">
                  {batch.total_rows} linhas importadas · conferência inicial: {batch.reviewed_rows} · registros e revisões disponíveis abaixo
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-sky-800 dark:text-sky-300">
                {selected?.id === batch.id ? "Ocultar" : "Revisar pendências"}
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
              <button type="button" disabled={!auditAvailable || saving} onClick={() => beginManage(batch, showArchived ? "restore" : "archive")}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800">
                {showArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {showArchived ? "Restaurar importação" : "Arquivar importação antiga"}
              </button>
            </div>
            {manageId === batch.id ? (
              <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Motivo do {manageAction === "archive" ? "arquivamento" : "restauro"} (mínimo 20 caracteres)
                </label>
                <Textarea value={manageNote} onChange={(e) => setManageNote(e.target.value)} maxLength={1200} rows={2}
                  placeholder="Ex.: PDF substituído por nova versão oficial; manter histórico para auditoria."
                  className="min-h-[76px] w-full bg-white text-sm text-slate-900 dark:bg-slate-950 dark:text-white" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={saving || manageNote.trim().length < 20}
                    onClick={() => void saveManage(batch)} data-urban-matrix-primary-action="true" aria-busy={saving}
                    className="sig-force-dark-action min-h-11 rounded-xl bg-slate-950 !text-white hover:bg-slate-800 disabled:!text-white disabled:opacity-100">
                    <span data-urban-matrix-primary-label="true" className="!text-white">
                      {saving ? "Registrando..." : "Confirmar " + (manageAction === "archive" ? "arquivamento" : "restauro")}
                    </span>
                  </Button>
                  <Button type="button" variant="outline" disabled={saving} onClick={() => setManageId(null)}>Cancelar</Button>
                </div>
              </div>
            ) : null}
          </div>
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
            <div className="h-full rounded-full bg-sky-700" style={{ width: String(progress.percentage) + "%" }} />
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            <FileWarning className="mr-1 inline h-4 w-4" />
            Sem vigência comprovada: não ativar. Quadro II possui sugestões extraídas em lote independente,
            mas ainda não passou por conferência legal integral. Mesmo que a leitura chegue a 100%,
            os índices só poderão ser usados após validação legal independente.
          </div>
          <p className="break-all text-[11px] text-slate-500">Fonte: {selected.document_title} · SHA-256 {selected.document_sha256}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {showAll ? "Todas as linhas" : "Pendências para revisar (" + progress.pending + ")"}
            </p>
            <button type="button" onClick={() => { setShowAll((v) => !v); setReviewingIndex(null); }}
              className="text-xs font-bold text-sky-800 underline underline-offset-4 dark:text-sky-300">
              {showAll ? "Mostrar somente pendentes" : "Ver todas as linhas"}
            </button>
          </div>
          {displayedRows.length === 0 ? (
            <p className="rounded-xl bg-white p-3 text-xs text-slate-700">
              Todas as leituras foram conferidas. A validação legal, as exceções e a vigência continuam obrigatórias.
            </p>
          ) : (
            <div className="space-y-2">
              {displayedRows.map((entry) => {
                const row = describeUrbanMatrixRow(entry.source);
                const page = Number(entry.source.pagina_pdf);
                const hasReadingIssue = Boolean(row.pending.trim());
                const analystGuidance = selected.analyst_guidance?.find((g) =>
                  g.row_index === entry.index &&
                  g.field_code === "ca_minimo_original" &&
                  g.status === "pending_documentary_confirmation"
                );
                return (
                  <details key={entry.index} data-urban-matrix-row="true"
                    className="group min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                      {entry.readingReviewed ? <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <FileWarning className="h-4 w-4 shrink-0 text-amber-700" />}
                      <strong className="min-w-0 flex-1 break-words text-slate-950 dark:text-white">
                        {row.zone} · {row.usage}
                      </strong>
                      <span className="text-xs text-slate-500">Quadro {row.quadro} · pág. {row.page}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 dark:text-sky-300">
                        Ver índices <ChevronDown className="h-3.5 w-3.5" />
                      </span>
                    </summary>
                    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 text-xs text-slate-700 dark:text-slate-200">
                      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                        {row.metrics.map((metric) => (
                          <p key={metric.label} className="min-w-0 break-words">
                            <span className="block text-slate-500 dark:text-slate-400">{metric.label}</span>
                            <strong className="font-semibold">{formatUrbanMatrixSourceValue(metric.value)}</strong>
                          </p>
                        ))}
                      </div>
                      {analystGuidance ? (
                        <div data-urban-matrix-analyst-guidance="true"
                          className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
                          <strong className="block text-sm">
                            AIU(2): CA mínimo sugerido pelo analista — {Number(analystGuidance.proposed_value).toLocaleString("pt-BR")}
                          </strong>
                          <p className="leading-5">
                            Informação relatada pelo solicitante. O original digitalizado registra
                            “{analystGuidance.original_ocr_text}”. O valor original permanece preservado;
                            ainda não é uma conferência documental nem libera a regra para a IA.
                          </p>
                          <p className="text-xs leading-5">{analystGuidance.source_note}</p>
                        </div>
                      ) : null}
                      {row.notes ? <p className="rounded-lg bg-amber-50 p-2 leading-5 text-amber-950">Exceção / observação: {row.notes}</p> : null}
                      {row.pending ? <p className="rounded-lg bg-rose-50 p-2 leading-5 text-rose-900">Leitura inconclusiva: {row.pending}</p> : null}
                      {entry.review ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          <strong>Última revisão: {entry.review.action === "reading_verified" ? "transcrição conferida" : "divergência registrada"}</strong>
                          <p className="mt-1 break-words">{entry.review.note}</p>
                          <p className="mt-1 text-slate-500">Registrada em {new Date(entry.review.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      ) : null}
                      <p className="font-semibold text-amber-800">
                        {entry.readingReviewed ? "Leitura conferida; vigência não comprovada."
                          : entry.needsCorrection ? "Divergência registrada: permanece pendente."
                            : "Aguardando revisão da leitura e das exceções."}
                      </p>
                      {!isArchived(selected.id) ? (
                        <Button type="button" variant="outline" disabled={!auditAvailable || saving}
                          onClick={() => startReview(entry.index, entry.review?.note, hasReadingIssue)}
                          className="min-h-10 border-sky-200 text-sky-900">
                          <ClipboardCheck className="mr-2 h-4 w-4" />
                          {entry.readingReviewed ? "Revisar novamente" : "Conferir esta linha"}
                        </Button>
                      ) : null}
                      {reviewingIndex === entry.index && !isArchived(selected.id) ? (
                        <div data-urban-matrix-reading-form="true" className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-700 dark:bg-slate-900">
                          <p className="font-bold text-sky-950 dark:text-sky-200">
                            Etapa de leitura: confira a página {row.page} do PDF {selected.document_title}
                          </p>
                          <p className="text-xs leading-5 text-slate-700 dark:text-slate-200">
                            Confira os números e as observações no original. Isto não significa aprovação legal.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label data-urban-matrix-reading-choice="true" className="flex min-w-0 items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-900 dark:bg-slate-950 dark:text-white">
                              <input type="radio" checked={decision === "reading_verified"}
                                disabled={hasReadingIssue} onChange={() => setDecision("reading_verified")} name={"reading-decision-" + entry.index} />
                              Números e observações conferidos com o original
                            </label>
                            <label data-urban-matrix-reading-choice="true" className="flex min-w-0 items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-900 dark:bg-slate-950 dark:text-white">
                              <input type="radio" checked={decision === "needs_correction"}
                                onChange={() => setDecision("needs_correction")} name={"reading-decision-" + entry.index} />
                              Existe divergência ou trecho ilegível
                            </label>
                          </div>
                          {hasReadingIssue ? (
                            <p className="rounded-lg bg-rose-50 p-2 font-semibold leading-5 text-rose-800">
                              Esta linha possui dúvida no original. Não é permitido confirmar sua leitura sem documento legível.
                            </p>
                          ) : null}
                          <label className="block text-xs font-semibold text-slate-900 dark:text-white">
                            Observação da conferência (mínimo 20 caracteres)
                          </label>
                          <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
                            maxLength={1200} rows={3} data-urban-matrix-reading-field="true" className="w-full bg-white text-slate-900 dark:bg-slate-950 dark:text-white"
                            placeholder="Informe o número/nota conferida ou descreva exatamente a divergência encontrada." />
                          <label className="flex items-start gap-2 text-xs font-medium text-slate-800 dark:text-slate-200">
                            <input type="checkbox" checked={pageConfirmed} onChange={(e) => setPageConfirmed(e.target.checked)} />
                            Confirmei esta página no PDF original e registrei a observação. Sei que isso não comprova vigência.
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" disabled={saving || !pageConfirmed || reviewNote.trim().length < 20}
                              onClick={() => void saveReview(entry.index, page, hasReadingIssue)}
                              data-urban-matrix-primary-action="true" aria-busy={saving}
                              className="sig-force-dark-action min-h-11 rounded-xl bg-slate-950 !text-white hover:bg-slate-800 disabled:!text-white disabled:opacity-100">
                              <span data-urban-matrix-primary-label="true" className="!text-white">
                                {saving ? "Salvando..." : "Registrar conferência"}
                              </span>
                            </Button>
                            <Button type="button" variant="outline" disabled={saving}
                              onClick={() => setReviewingIndex(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : null}
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
