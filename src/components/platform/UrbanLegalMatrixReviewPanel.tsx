import { useEffect, useMemo, useState } from "react";
import { Archive, BookOpenCheck, ChevronDown, ClipboardCheck, FileCheck2, FileWarning, Loader2, RotateCcw } from "lucide-react";
import {
  listUrbanMatrixBatches, readUrbanMatrixBatch, listUrbanMatrixReadingAudit,
  recordUrbanMatrixReadingAction,
  type UrbanMatrixBatchDetail, type UrbanMatrixBatchSummary,
  type UrbanMatrixReadingAudit, type UrbanMatrixReadingAction,
} from "@/integrations/backend/urbanPrecheckClient";
import { calculateUrbanMatrixBatchProgress, describePendingAnalystCa, describeUrbanMatrixRow, formatUrbanMatrixSourceValue } from "@/lib/urbanLegalMatrixReview";
import { isUrbanMatrixBatchArchived, latestUrbanMatrixBatchEvent } from "@/lib/urbanMatrixBatchStatus";
import { prepareUrbanRuleDraftFromReviewedRow, type PreparedUrbanMatrixDraft } from "@/lib/urbanMatrixDraftPreparation";
import { getAiu2ProvisionalCriterion } from "@/lib/urbanAiu2Provisional";
import { Aiu2ProvisionalComparison } from "@/components/platform/Aiu2ProvisionalComparison";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_AUDIT: UrbanMatrixReadingAudit = { row_reviews: [], batch_events: [] };
type ReviewDecision = "reading_verified" | "needs_correction";

/** A transcricao assinada nao comprova vigencia nem ativa normas. */
export function UrbanLegalMatrixReviewPanel({
  municipalityId, canView, canEdit = false, onPrepareDraft, onDataChanged, focusRegisteredCaveats = 0,
}: { municipalityId: string; canView: boolean; canEdit?: boolean;
  onPrepareDraft?: (draft: PreparedUrbanMatrixDraft) => void;
  onDataChanged?: () => void; focusRegisteredCaveats?: number }) {
  const [batches, setBatches] = useState<UrbanMatrixBatchSummary[]>([]);
  const [selected, setSelected] = useState<UrbanMatrixBatchDetail | null>(null);
  const [audit, setAudit] = useState<UrbanMatrixReadingAudit>(EMPTY_AUDIT);
  const [auditAvailable, setAuditAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showRegisteredCaveats, setShowRegisteredCaveats] = useState(false);
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
    if (!focusRegisteredCaveats) return;
    setShowAll(false);
    setShowRegisteredCaveats(true);
  }, [focusRegisteredCaveats]);

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
    setShowRegisteredCaveats(false);
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
          !isUrbanMatrixBatchArchived(latestEvents, batch.id),
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

  const batchEvent = (id: string) => latestUrbanMatrixBatchEvent(audit.batch_events, id);
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
      setShowRegisteredCaveats(false);
    } catch (err) { setError(String((err as Error)?.message || err)); }
    finally { setDetailLoading(false); }
  };

  const progress = useMemo(
    () => selected ? calculateUrbanMatrixBatchProgress(selected, audit.row_reviews) : null,
    [selected, audit],
  );
  // Ressalvas já registradas (histórico) ficam recolhidas na visão inicial.
  const displayedRows = useMemo(() => {
    if (!progress) return [];
    return showAll ? progress.rows : progress.rows.filter((row) =>
      !row.readingReviewed && (!row.needsCorrection || showRegisteredCaveats),
    );
  }, [progress, showAll, showRegisteredCaveats]);

  const startReview = (index: number, existingNote?: string, hasReadingIssue = false) => {
    if (!canEdit) return;
    setReviewingIndex(index);
    setDecision(hasReadingIssue ? "needs_correction" : "reading_verified");
    setReviewNote(existingNote || "");
    setPageConfirmed(false);
    setError("");
    setNotice("");
  };

  const saveReview = async (index: number, page: number, hasReadingIssue: boolean) => {
    if (!canEdit || !selected || !auditAvailable || saving) return;
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
      onDataChanged?.();
      setReviewingIndex(null);
      setReviewNote("");
      setPageConfirmed(false);
      setNotice(decision === "reading_verified"
        ? "Leitura registrada e assinada no Neon. A vigência e a norma legal continuam pendentes."
        : "Ressalva registrada no histórico. A leitura foi tratada administrativamente; o índice segue pendente de validação legal.");
    } catch (err) { setError(String((err as Error)?.message || err)); }
    finally { setSaving(false); }
  };

  const beginManage = (batch: UrbanMatrixBatchSummary, action: "archive" | "restore") => {
    if (!canEdit) return;
    setManageId(batch.id);
    setManageAction(action);
    setManageNote("");
    setError("");
    setNotice("");
  };
  const saveManage = async (batch: UrbanMatrixBatchSummary) => {
    if (!canEdit) return;
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
      onDataChanged?.();
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

      {loading ? <p role="status" className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> Consultando lotes importados...</p> : null}
      {error ? <p role="alert" className="mt-3 break-words rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 break-words rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">{notice}</p> : null}
      {!loading && !error && batches.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200">Nenhum lote de parâmetros legais ainda foi salvo nesta Prefeitura.</p>
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
        <p className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200">
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
            {canEdit ? <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
              <button type="button" disabled={!auditAvailable || saving} onClick={() => beginManage(batch, showArchived ? "restore" : "archive")}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800">
                {showArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {showArchived ? "Restaurar importação" : "Arquivar importação antiga"}
              </button>
            </div> : null}
            {canEdit && manageId === batch.id ? (
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

      {detailLoading ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> Carregando páginas e zonas...</p> : null}
      {selected && progress ? (
        <div className="mt-4 space-y-3" data-urban-matrix-progress="true">
          <div data-urban-matrix-handled-progress="true" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              {label: "Linhas extraídas", count: progress.total},
              {label: "Leituras conferidas", count: progress.reviewed},
              {label: "Ressalvas documentadas", count: progress.needsCorrection},
              {label: "Sem revisão", count: progress.untreated},
            ].map((card) => (
              <div key={card.label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-xs text-slate-600 dark:text-slate-300">{card.label}</p>
                <p className="text-xl font-black text-slate-950 dark:text-white">{card.count}</p>
              </div>
            ))}
          </div>
          <div aria-label="Progresso dos registros de leitura tratados" className="h-2.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-sky-700" style={{ width: String(progress.handledPercentage) + "%" }} />
          </div>
          {progress.untreated === 0 && progress.needsCorrection > 0 ? (
            <div data-urban-matrix-reading-treated="true"
              className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950">
              <strong className="block text-sm">
                Etapa documental tratada: {progress.handled} de {progress.total} registros
              </strong>
              {progress.reviewed} leituras conferidas e {progress.needsCorrection} ressalva(s)
              já registrada(s) no histórico. Não é necessário repetir a conferência da AIU(2).
              A ressalva NÃO confirma o CA mínimo, não homologa a lei nem libera esse índice à IA.
            </div>
          ) : null}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            <FileWarning className="mr-1 inline h-4 w-4" />
            Sem vigência comprovada: não ativar. Quadro II possui sugestões extraídas em lote independente,
            mas ainda não passou por conferência legal integral. Mesmo que a leitura chegue a 100%,
            os índices só poderão ser usados após validação legal independente.
          </div>
          <p className="break-all text-[11px] text-slate-500">Fonte: {selected.document_title} · SHA-256 {selected.document_sha256}</p>
          <div data-urban-matrix-summary-actions="true"
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
            <div className="min-w-0 flex-1">
              <p className="break-words text-xs font-extrabold text-slate-950 dark:text-white">
                {progress.untreated === 0
                  ? "Nenhuma nova revisão de leitura necessária"
                  : "Faltam " + progress.untreated + " registro(s) de conferência"}
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-slate-600 dark:text-slate-300">
                {progress.needsCorrection > 0
                  ? progress.needsCorrection + " ressalva(s) registrada(s) e preservada(s) para consulta. A comprovação legal continua pendente."
                  : "A conferência da leitura não substitui a verificação jurídica nem comprova vigência."}
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {progress.needsCorrection > 0 ? (
                <button type="button" data-urban-matrix-caveats-toggle="true"
                  aria-expanded={!showAll && showRegisteredCaveats}
                  onClick={() => {
                    setShowRegisteredCaveats((value) => !value);
                    setShowAll(false);
                    setReviewingIndex(null);
                  }}
                  className="min-h-9 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
                  {!showAll && showRegisteredCaveats
                    ? "Ocultar ressalvas"
                    : "Ver ressalvas registradas (" + progress.needsCorrection + ")"}
                </button>
              ) : null}
              <button type="button" onClick={() => { setShowAll((value) => !value); setReviewingIndex(null); }}
                className="min-h-9 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-950 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
                {showAll ? "Voltar à visão resumida" : "Ver todas as linhas"}
              </button>
            </div>
          </div>
          {displayedRows.length === 0 ? (
            <p data-urban-matrix-no-unreviewed="true"
              className="rounded-xl border border-sky-100 bg-white p-3 text-xs leading-5 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              {progress.untreated === 0
                ? "A etapa de leitura está tratada. Consulte as ressalvas apenas se houver nova evidência. Falta a comprovação jurídica e da vigência antes de liberar índices para a IA."
                : "Nenhuma linha disponível neste filtro. Consulte todas as linhas para revisar os registros."}
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
                const pendingCa = describePendingAnalystCa(analystGuidance);
                const provisionalCa = getAiu2ProvisionalCriterion(entry.source, entry.index, analystGuidance);
                // Keep the legal evidence and audit log, but avoid turning a
                // single AIU(2) pending item into a several-screen-tall card.
                const auditHistory = (
                  <div className="space-y-3">
                      {pendingCa && /0[,.]1/.test(row.pending) ? (
                        <p data-aiu2-conflicting-review="true"
                          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                          <strong className="block">Por que a AIU(2) continua pendente?</strong>
                          A extração antiga levantou a hipótese de 0,1 sem confirmação.
                          O analista orientou {pendingCa.formatted}. São informações conflitantes
                          na leitura, não duas normas válidas. {provisionalCa
                            ? "A Prefeitura utiliza 1 como critério técnico transitório na revisão manual, enquanto aguarda o CONCIDADE."
                            : "É necessária comprovação documental para liberar o índice à IA."}
                        </p>
                      ) : null}
                      {pendingCa && analystGuidance ? (
                        <div data-urban-matrix-analyst-guidance="true"
                          className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-slate-900">
                          <strong className="block text-sm text-sky-950">Origem da proposta e situação legal</strong>
                          {provisionalCa ? <p data-aiu2-provisional-label="true"
                            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-extrabold text-amber-950">
                            CA mínimo = 1,00 · critério técnico provisório da Prefeitura.
                            CONCIDADE ainda não deliberou; revisão da lei pendente.
                            Somente simulação manual, não aprovação automática.
                          </p> : null}
                          <p className="leading-5">
                            Orientação do analista relatada pelo solicitante.
                            OCR original: “{pendingCa.sourceOcr}”. A extração original foi preservada.
                          </p>
                          <p className="font-semibold text-amber-950">
                            {provisionalCa ? "Critério técnico provisório, sem homologação jurídica" : pendingCa.status}.
                            Não ativado para análise automática.
                          </p>
                          {provisionalCa ? <Aiu2ProvisionalComparison criterion={provisionalCa} /> : null}
                          <details className="rounded-lg border border-sky-200 bg-white px-3 py-2">
                            <summary className="cursor-pointer font-bold text-sky-950">
                              Ver registro detalhado da orientação
                            </summary>
                            <p className="mt-2 break-words text-xs leading-5 text-slate-800">
                              {analystGuidance.source_note}
                            </p>
                          </details>
                        </div>
                      ) : null}
                      {row.notes ? <p className="rounded-lg bg-amber-50 p-2 leading-5 text-amber-950">Exceção / observação: {row.notes}</p> : null}
                      {row.pending ? (
                        <details className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-900">
                          <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                            {pendingCa ? "Ver pendência da leitura automática original" : "Leitura inconclusiva"}
                          </summary>
                          <p className="mt-2 break-words text-xs leading-5">{row.pending}</p>
                        </details>
                      ) : null}
                      {entry.review ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          <strong>Última revisão: {entry.review.action === "reading_verified" ? "transcrição conferida" : "divergência registrada"}</strong>
                          <p className="mt-1 break-words">{entry.review.note}</p>
                          <p className="mt-1 text-slate-500">Registrada em {new Date(entry.review.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      ) : null}
                  </div>
                );
                return (
                  <details key={entry.index} data-urban-matrix-row="true"
                    className="group min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                      {entry.readingReviewed ? <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <FileWarning className="h-4 w-4 shrink-0 text-amber-700" />}
                      <strong className="min-w-0 flex-1 break-words text-slate-950 dark:text-white">
                        {row.zone} · {row.usage}
                      </strong>
                      {pendingCa ? (
                        <span data-urban-matrix-ca-chip="true"
                          className="max-w-full break-words rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-950">
                          {provisionalCa
                            ? "CA mínimo provisório: 1,00 · CONCIDADE pendente"
                            : `CA mínimo proposto: ${pendingCa.formatted} · pendente`}
                        </span>
                      ) : null}
                      <span className="text-xs text-slate-500">Quadro {row.quadro} · pág. {row.page}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 dark:text-sky-300">
                        Ver índices <ChevronDown className="h-3.5 w-3.5" />
                      </span>
                    </summary>
                    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 text-xs text-slate-700 dark:text-slate-200">
                      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                        {row.metrics.map((metric) => (
                          <div key={metric.label}
                            className={pendingCa && metric.label === "CA mínimo"
                              ? "min-w-0 break-words border-l-[3px] border-amber-400 pl-3"
                              : "min-w-0 break-words"}>
                            <span className={pendingCa && metric.label === "CA mínimo"
                              ? "block font-bold text-amber-950"
                              : "block text-slate-500 dark:text-slate-400"}>{metric.label}</span>
                            {pendingCa && metric.label === "CA mínimo" ? (
                              <div data-urban-matrix-ca-pending="true" className="space-y-0.5">
                                <strong className="block text-lg font-extrabold text-slate-950">{pendingCa.formatted}</strong>
                                <span className="block text-[11px] font-bold leading-4 text-amber-950">
                                  Proposta do analista — não homologada
                                </span>
                              </div>
                            ) : (
                              <strong className="font-semibold">{formatUrbanMatrixSourceValue(metric.value)}</strong>
                            )}
                          </div>
                        ))}
                      </div>
                      {pendingCa ? (
                        <details data-urban-matrix-compact-history="true"
                          className="group/history min-w-0 rounded-xl border border-slate-200 bg-slate-50 text-slate-900">
                          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-3 text-xs font-bold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 [&::-webkit-details-marker]:hidden">
                            <span className="inline-flex items-center gap-2">
                              <BookOpenCheck className="h-4 w-4 shrink-0 text-sky-800" />
                              Histórico e justificativas da AIU(2)
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-sky-900">
                              Ver histórico <ChevronDown className="h-4 w-4 transition-transform group-open/history:rotate-180" />
                            </span>
                          </summary>
                          <div className="border-t border-slate-200 p-3">
                            {auditHistory}
                          </div>
                        </details>
                      ) : auditHistory}
                      <p className="font-semibold text-amber-800">
                        {entry.readingReviewed ? "Leitura conferida; vigência não comprovada."
                          : entry.needsCorrection ? "Ressalva já registrada: leitura tratada, comprovação legal pendente."
                            : "Aguardando revisão da leitura e das exceções."}
                      </p>
                      {pendingCa && entry.needsCorrection && reviewingIndex !== entry.index ? (
                        <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                          Não marque a caixa nem registre essa mesma observação novamente. A ressalva
                          já consta no histórico; só edite se houver nova evidência técnica.
                        </p>
                      ) : null}
                      {canEdit && !isArchived(selected.id) ? (
                        <Button type="button" variant="outline" disabled={!auditAvailable || saving}
                          onClick={() => reviewingIndex === entry.index
                             ? setReviewingIndex(null)
                             : startReview(entry.index, entry.review?.note, hasReadingIssue)}
                          className="min-h-10 border-sky-200 text-sky-900">
                          <ClipboardCheck className="mr-2 h-4 w-4" />
                          {reviewingIndex === entry.index ? "Fechar conferência"
                             : entry.readingReviewed ? "Revisar novamente"
                             : entry.needsCorrection ? "Editar observação, se necessário"
                             : "Conferir esta linha"}
                        </Button>
                      ) : null}
                      {canEdit && onPrepareDraft && entry.readingReviewed && !entry.needsCorrection &&
                        !hasReadingIssue && !isArchived(selected.id) ? (
                        <Button type="button" variant="outline"
                          data-urban-matrix-prepare-draft="true"
                          className="min-h-10 border-sky-300 text-sky-900"
                          onClick={() => {
                            const prepared = prepareUrbanRuleDraftFromReviewedRow(
                              entry.source, selected.document_title, true);
                            if (!prepared) {
                              setError("Esta linha não contém limites numéricos seguros para pré-preencher.");
                              return;
                            }
                            onPrepareDraft(prepared);
                            setNotice("Rascunho preparado no cadastro jurídico abaixo. Confira a vigência e os artigos antes de salvar.");
                          }}>
                          Preparar rascunho — sem ativar IA
                        </Button>
                      ) : null}
                      {canEdit && reviewingIndex === entry.index && !isArchived(selected.id) ? (
                        <div data-urban-matrix-reading-form="true" className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-700 dark:bg-slate-900">
                          <p className="font-bold text-sky-950 dark:text-sky-200">
                            {entry.needsCorrection ? "Edição opcional da ressalva já registrada" : "Conferência da leitura"} · página {row.page} do PDF {selected.document_title}
                          </p>
                          <p className="text-xs leading-5 text-slate-700 dark:text-slate-200">
                            {entry.needsCorrection
                              ? "Esta ressalva já foi registrada. Feche o formulário se não houver informação nova; não é necessário reenviar."
                              : "Confira os números e as observações no original. Isto não significa aprovação legal."}
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
                            {decision === "needs_correction"
                              ? "Revisei a evidência disponível e registrei a ressalva. Sei que isso não comprova o índice nem a vigência."
                              : "Confirmei esta página no PDF original e registrei a observação. Sei que isso não comprova vigência."}
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" disabled={saving || !pageConfirmed || reviewNote.trim().length < 20}
                              onClick={() => void saveReview(entry.index, page, hasReadingIssue)}
                              data-urban-matrix-primary-action="true" aria-busy={saving}
                              className="sig-force-dark-action min-h-11 rounded-xl bg-slate-950 !text-white hover:bg-slate-800 disabled:!text-white disabled:opacity-100">
                              <span data-urban-matrix-primary-label="true" className="!text-white">
                                {saving ? "Salvando..." : decision === "needs_correction"
                                  ? "Salvar ressalva atualizada" : "Registrar conferência"}
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
