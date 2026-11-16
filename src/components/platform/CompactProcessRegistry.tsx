import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Archive, ArchiveRestore, CalendarClock, ChevronLeft,
  ChevronRight, Clock3, ExternalLink, FileWarning, Flag, History,
  MoreHorizontal, Send, Workflow, Flame, Eye, MapPin, CheckCircle2, Layers3, AlertCircle, ClipboardCheck, Gavel, Tag, ArrowUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { paginateMunicipalItems } from "@/lib/municipalListPagination";
import {
  buildProcessPath, formatOfficialProcessNumber, formatOfficialProcessTitle,
  parseMarker, statusLabel, statusTone, type ProcessRecord,
} from "@/lib/platform";
import { cn } from "@/lib/utils";
import "@/styles/compact-process-registry.css";

type CompactProcessRegistryProps = {
  processes: ProcessRecord[];
  archivedProcessIds?: string[];
  onToggleArchive?: (processId: string, archived: boolean) => void;
  emptyMessage?: string;
  showArchiveAction?: boolean;
  canDispatchProcess?: (process: ProcessRecord) => boolean;
  detailPathSuffix?: string;
  selectedProcessIds?: string[];
  onToggleSelection?: (processId: string, selected: boolean) => void;
  /** A readonly view for a municipal administrator or external stakeholder. */
  showSensitiveDetails?: boolean;
  defaultPageSize?: number;
  onVisiblePageChange?: (ids: string[]) => void;
};

const pageSizes = [10, 25, 50] as const;
const openRequirementStates = new Set(["aberta", "respondida"]);
const openGuideStates = new Set(["pendente", "pending"]);

function processFacts(process: ProcessRecord) {
  const requirements = (process.requirements ?? []).filter((item) =>
    openRequirementStates.has(item.status),
  ).length;
  // These are guide *status* indicators, never claims of bank settlement.
  const guides = process.payment?.guides ?? [];
  const pendingGuides = guides.length
    ? guides.filter((guide) => openGuideStates.has(guide.status)).length
    : (process.payment?.guideNumber && process.payment.status === "pendente" ? 1 : 0);
  const urgent = Boolean(process.sla?.breached || (typeof process.sla?.hoursRemaining === "number" && process.sla.hoursRemaining <= 12));
  const due = String(process.sla?.dueDate || "").trim();
  const flow = (
    process.processControl?.currentFolder ||
    process.dispatches?.[0]?.to ||
    process.sla?.currentStage ||
    statusLabel(process.status)
  ).trim();
  return { requirements, pendingGuides, urgent, due, flow };
}

function markersFor(process: ProcessRecord) {
  return (process.tags ?? []).map((tag) => parseMarker(tag));
}

/** Visual SEI-style glyph is derived only from the saved marker label.
 * The underlying marker/color and audit record remain untouched. */
function markerIcon(label: string) {
  const value = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/sla|urgente|critico|prioridade/.test(value)) return Flame;
  if (/vistoria|localizacao|mapa|local/.test(value)) return MapPin;
  if (/exigencia|pendencia|alerta/.test(value)) return AlertCircle;
  if (/decisao|deferimento|assinatura/.test(value)) return Gavel;
  if (/analise|projeto|avaliacao/.test(value)) return Layers3;
  if (/visualizacao|acompanha|especial/.test(value)) return Eye;
  if (/concluido|aprovado|recebido/.test(value)) return ClipboardCheck;
  if (/validado|confirmado/.test(value)) return CheckCircle2;
  return Tag;
}

/**
 * The same responsive process-control workspace is reused by dashboard,
 * municipality administration and process registry. It never fetches another
 * municipality, changes permissions or performs implicit bulk decisions.
 *
 * Uses container queries instead of viewport breakpoints: no artificial
 * min-width or clipped action column inside a municipal sidebar layout.
 */
export function CompactProcessRegistry({
  processes,
  archivedProcessIds = [],
  onToggleArchive,
  emptyMessage = "Nenhum processo encontrado.",
  showArchiveAction = true,
  canDispatchProcess = () => false,
  detailPathSuffix = "",
  selectedProcessIds = [],
  onToggleSelection,
  showSensitiveDetails = true,
  defaultPageSize = 25,
  onVisiblePageChange,
}: CompactProcessRegistryProps) {
  const pageSizeControlId = useId();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [sortOrder, setSortOrder] = useState<"default" | "number_asc" | "number_desc" | "deadline_asc" | "deadline_desc">("default");
  const orderedProcesses = useMemo(() => {
    if (sortOrder === "default") return processes;
    const sorted = [...processes];
    if (sortOrder.startsWith("number")) {
      sorted.sort((a, b) => String(a.protocol || "").localeCompare(String(b.protocol || ""), "pt-BR", { numeric: true }));
    } else {
      const due = (item: ProcessRecord) => {
        const value = String(item.sla?.dueDate || "");
        const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (br) return Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
        const time = Date.parse(value);
        return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
      };
      sorted.sort((a, b) => due(a) - due(b));
    }
    if (sortOrder.endsWith("_desc")) sorted.reverse();
    return sorted;
  }, [processes, sortOrder]);
  const pageData = useMemo(
    () => paginateMunicipalItems(orderedProcesses, page, pageSize),
    [orderedProcesses, page, pageSize],
  );
  useEffect(() => {
    if (page !== pageData.page) setPage(pageData.page);
  }, [page, pageData.page]);
  const visiblePageSignature = pageData.items.map(process => process.id).join("|");
  useEffect(() => {
    onVisiblePageChange?.(visiblePageSignature ? visiblePageSignature.split("|") : []);
  }, [visiblePageSignature, onVisiblePageChange]);

  const selectable = Boolean(onToggleSelection);
  const currentPageIds = pageData.items.map((process) => process.id);
  const selectedSet = useMemo(() => new Set(selectedProcessIds), [selectedProcessIds]);
  const checkedCount = currentPageIds.filter((id) => selectedSet.has(id)).length;
  const allPageSelected = currentPageIds.length > 0 && checkedCount === currentPageIds.length;

  if (processes.length === 0) {
    return (
      <div data-sei-process-registry="true"
        className="rounded-[18px] border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {emptyMessage}
      </div>
    );
  }

  return (
    <section data-sei-process-registry="true" data-sigapro-process-control="premium-table"
      data-sigapro-responsive-layout="container" data-has-selection={selectable ? "true" : "false"}
      className="sig-process-registry min-w-0 w-full overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.075)] dark:border-slate-700 dark:bg-slate-950">
      <div className="sig-process-content min-w-0 w-full">
          <div className="sig-process-head min-h-11 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 text-[11px] font-bold uppercase tracking-[0.045em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <div className="sig-process-head-marker flex min-w-0 items-center justify-center gap-2" title="Marcador">
              {selectable ? (
                <input type="checkbox" checked={allPageSelected}
                  aria-label="Selecionar processos desta página"
                  onChange={(event) => currentPageIds.forEach((id) => onToggleSelection?.(id, event.target.checked))}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-sky-800" />
              ) : null}
              <Flag className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">Marcador</span>
              <span className="sig-reference-marker-heading" aria-hidden="true">Marcadores</span>
            </div>
            <button type="button" className="sig-process-head-number sig-reference-sort" onClick={() => { setSortOrder(current => current === "number_asc" ? "number_desc" : "number_asc"); setPage(1); }}
              aria-label="Ordenar processos por número" aria-pressed={sortOrder.startsWith("number")}>Nº do processo <ArrowUpDown className="h-3 w-3" /></button>
            <span className="sig-process-head-subject">Assunto / interessado</span>
            <span className="sig-process-head-stage"><span className="sig-process-head-stage-medium">Andamento / equipe / prazos</span><span className="sig-process-head-stage-wide">Etapa atual</span></span>
            <span className="sig-process-head-owner">Responsável</span>
            <button type="button" className="sig-process-head-deadline sig-reference-sort" onClick={() => { setSortOrder(current => current === "deadline_asc" ? "deadline_desc" : "deadline_asc"); setPage(1); }}
              aria-label="Ordenar processos por prazo" aria-pressed={sortOrder.startsWith("deadline")}>Prazo <ArrowUpDown className="h-3 w-3" /></button>
            <span className="sig-process-head-pending">Pendências</span>
            <span className="sig-process-head-actions text-right">Ações</span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800" role="list" aria-label="Processos encontrados">
            {pageData.items.map((process, index) => {
              const marker = process.tags?.[0] ? parseMarker(process.tags[0]) : null;
              const markers = markersFor(process);
              const archived = archivedProcessIds.includes(process.id);
              const fact = processFacts(process);
              // External/owner views must not reveal internal ownership, folder,
              // requirements or bank metadata through a generic table.
              const restrictedExternal = !showSensitiveDetails &&
                process.processControl?.externalTransitView !== "completo";
              const visibleRequirements = showSensitiveDetails
                ? fact.requirements
                : (process.requirements ?? []).filter((item) =>
                    item.visibility !== "interno" && openRequirementStates.has(item.status)).length;
              const visiblePendingGuides = showSensitiveDetails ? fact.pendingGuides : 0;
              const visibleFlow = restrictedExternal ? statusLabel(process.status) : fact.flow;
              const analyst = showSensitiveDetails
                ? (process.analysis?.assignedTo || process.technicalLead || "Não atribuído")
                : "Acompanhamento externo";
              const detailPath = buildProcessPath(process) + detailPathSuffix;
              const number = formatOfficialProcessNumber(process.protocol);
              const title = formatOfficialProcessTitle({ title: process.title, type: process.type });
              const compactNumber = String(process.protocol || "").trim().match(/^PM-\d{4}-\d+$/i)
                ? String(process.protocol).trim()
                : number.replace(/^Processo\s+n[º°]\s*/i, "");
              const selected = selectedSet.has(process.id);
              return (
                <div role="listitem" key={process.id} data-sei-process-row="true"
                  className={cn(
                    "sig-process-row group min-w-0 transition-colors",
                    index % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50/55 dark:bg-slate-900/65",
                    "hover:bg-sky-50/80 dark:hover:bg-sky-950/30",
                    archived && "opacity-75",
                    selected && "bg-sky-100/70 dark:bg-sky-950/40",
                  )}>
                  <div className="sig-process-marker flex min-w-0 flex-wrap items-center justify-center gap-1" aria-label="Marcadores do processo">
                    {selectable ? (
                      <input type="checkbox" checked={selected}
                        onChange={(event) => onToggleSelection?.(process.id, event.target.checked)}
                        aria-label={"Selecionar processo " + number}
                        className="mr-1 h-4 w-4 shrink-0 cursor-pointer accent-sky-800" />
                    ) : null}
                    {markers.slice(0, 2).map((item, markerIndex) => {
                      const MarkerIcon = markerIcon(item.label);
                      return (
                        <span key={markerIndex} title={item.label}
                          className="sig-reference-marker inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                          style={{ color: item.color, backgroundColor: item.color + "12" }}>
                          <MarkerIcon className="h-4 w-4" strokeWidth={2.6} />
                        </span>
                      );
                    })}
                    {markers.length > 2 ? (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-white" title="Marcadores adicionais">
                        +{markers.length - 2}
                      </span>
                    ) : null}
                    {!marker && fact.urgent ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" aria-label="Prazo crítico" />
                    ) : null}
                    {!marker && !fact.urgent ? (
                      <Flag className="h-4 w-4 shrink-0 text-slate-400" aria-label="Sem marcador" />
                    ) : null}
                  </div>

                  <div className="sig-process-number min-w-0">
                    <Link to={detailPath} data-sei-process-link="true"
                      className="sig-process-number-link inline-block max-w-full align-middle text-[13px] font-extrabold leading-5 text-sky-900 underline decoration-sky-300 underline-offset-[3px] hover:text-sky-700 dark:text-sky-200"
                      title={"Abrir " + number}>{compactNumber}</Link>
                    {marker ? (
                      <p title={marker.label} className="sig-process-marker-label mt-1 max-w-full text-[11px] font-semibold text-slate-600 dark:text-slate-300">{marker.label}</p>
                    ) : null}
                  </div>

                  <div className="sig-process-subject min-w-0">
                    <p title={showSensitiveDetails && process.ownerName ? `${title} · Interessado: ${process.ownerName}` : title} className="sig-process-subject-title max-w-full text-[13px] font-semibold leading-5 text-slate-900 dark:text-white">{title}</p>
                    {showSensitiveDetails ? (
                      <p title={process.ownerName} className="sig-process-interested mt-0.5 max-w-full text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                        {process.ownerName || "Interessado não informado"}
                      </p>
                    ) : null}
                  </div>

                  <div className="sig-process-flow-group">
                    <div className="sig-process-stage min-w-0">
                      <span className="sig-process-cell-label">Etapa</span>
                      <Badge variant="outline" className={cn("sig-process-status max-w-full rounded-full px-2 py-1 text-[11px] font-semibold", statusTone(process.status))} title={[statusLabel(process.status), visibleFlow].filter((value, i, arr) => arr.indexOf(value) === i).join(" · ")}>
                      <Workflow className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
                      {statusLabel(process.status)}
                    </Badge>
                    {visibleFlow !== statusLabel(process.status) ? (
                        <p title={visibleFlow} className="sig-process-stage-description mt-1 max-w-full text-[11px] text-slate-500 dark:text-slate-300">{visibleFlow}</p>
                      ) : null}
                  </div>

                    <div className="sig-process-responsible min-w-0">
                      <span className="sig-process-cell-label">Responsável</span>
                      <p title={analyst} className="sig-process-responsible-name max-w-full text-[12px] font-semibold leading-5 text-slate-700 dark:text-slate-200">{analyst}</p>
                    </div>

                    <div className="sig-process-deadline min-w-0">
                      <span className="sig-process-cell-label">Prazo</span>
                      <span title={restrictedExternal ? "Prazo disponível na consulta do processo" : (fact.due || "Prazo não informado")}
                      className={cn("sig-process-due-chip inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold tabular-nums",
                        fact.urgent ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200")}>
                      <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="sig-process-due-value">{restrictedExternal ? "Consultar etapa" : (fact.due || "Sem prazo")}</span>
                    </span>
                  </div>

                    <div className="sig-process-pending flex min-w-0 flex-wrap items-center gap-1">
                      <span className="sig-process-cell-label">Pendências</span>
                      {visibleRequirements > 0 ? (
                      <span title="Exigências em aberto" className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] font-semibold text-amber-900">
                        <FileWarning className="h-3 w-3 shrink-0" />{visibleRequirements} exig.
                      </span>
                    ) : null}
                    {visiblePendingGuides > 0 ? (
                      <span title="Guias cadastradas com status pendente; não representa liquidação bancária" className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-1.5 py-1 text-[10px] font-semibold text-rose-800">
                        <Clock3 className="h-3 w-3 shrink-0" />{visiblePendingGuides} guia(s)
                      </span>
                    ) : null}
                    {visibleRequirements === 0 && visiblePendingGuides === 0 ? <span className="text-xs text-slate-400">—</span> : null}
                    </div>
                  </div>

                  <div className="sig-process-actions flex min-w-0 items-center justify-end gap-1.5">
                    <Button asChild size="sm"
                      className="sig-process-open-btn h-9 shrink-0 rounded-lg bg-[#0b3e67] px-3 text-[11px] font-bold !text-white hover:bg-[#075985]">
                      <Link to={detailPath} aria-label={"Abrir processo " + compactNumber}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Abrir processo
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="icon" className="sig-process-more-btn h-9 w-9 shrink-0 rounded-lg border-slate-300"
                          aria-label={"Mais ações do processo " + number}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[200px] bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                        <DropdownMenuItem asChild>
                          <Link to={buildProcessPath(process, "historico")}>
                            <History className="mr-2 h-4 w-4" /> Ver histórico
                          </Link>
                        </DropdownMenuItem>
                        {canDispatchProcess(process) ? (
                          <DropdownMenuItem asChild>
                            <Link to={buildProcessPath(process, "historico") + "#despacho"}>
                              <Send className="mr-2 h-4 w-4" /> Despachar
                            </Link>
                          </DropdownMenuItem>
                        ) : null}
                        {showArchiveAction && onToggleArchive ? (
                          <DropdownMenuItem onSelect={() => onToggleArchive(process.id, !archived)}>
                            {archived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                            {archived ? "Restaurar na lista" : "Arquivar da minha lista"}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
      </div>

      <footer data-sigapro-process-footer="reference" className="sig-reference-footer flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50/90 px-3 py-3 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite">
            Exibindo {pageData.start + 1}–{pageData.end} de {pageData.total.toLocaleString("pt-BR")} processos
          </span>
          <div className="sig-reference-legend" aria-label="Legenda dos marcadores">
            <span className="sig-reference-legend-label">Marcadores:</span>
            <span className="sig-reference-legend-chip danger"><Flame className="h-3.5 w-3.5" /> SLA crítico</span>
            <span className="sig-reference-legend-chip pending"><FileWarning className="h-3.5 w-3.5" /> Guia pendente</span>
            <span className="sig-reference-legend-chip warning"><AlertCircle className="h-3.5 w-3.5" /> Exigência</span>
            <span className="sig-reference-legend-chip blue"><Layers3 className="h-3.5 w-3.5" /> Análise</span>
            <span className="sig-reference-legend-chip purple"><MapPin className="h-3.5 w-3.5" /> Vistoria</span>
            <span className="sig-reference-legend-chip green"><Gavel className="h-3.5 w-3.5" /> Em decisão</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={pageSizeControlId} className="font-medium">Itens por página:</label>
          <select id={pageSizeControlId} value={pageSize}
            onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
            {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          {pageData.totalPages > 1 ? (
            <nav data-sigapro-process-pagination="true" aria-label="Paginação de processos" className="flex items-center gap-1">
              <Button type="button" size="sm" variant="outline" disabled={pageData.page <= 1}
                className="h-8 rounded-lg border-slate-300 bg-white px-2 text-slate-800"
                onClick={() => setPage(pageData.page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </Button>
              <span className="sig-reference-page-label min-w-[90px] text-center font-semibold" aria-live="polite">Página {pageData.page} de {pageData.totalPages}</span>
              <div className="sig-reference-page-buttons">
                {Array.from(new Set([
                  1, Math.max(1, pageData.page - 1), pageData.page,
                  Math.min(pageData.totalPages, pageData.page + 1),
                  pageData.totalPages,
                ])).sort((a, b) => a - b).map((pageNumber, index, pages) => (
                  <span key={pageNumber} className="sig-reference-page-cluster">
                    {index > 0 && pageNumber - pages[index - 1] > 1 ? <span className="sig-reference-ellipsis" aria-hidden="true">…</span> : null}
                    <button type="button" aria-label={"Ir para página " + pageNumber}
                      aria-current={pageData.page === pageNumber ? "page" : undefined}
                      onClick={() => setPage(pageNumber)}
                      className={"sig-reference-page-button " + (pageData.page === pageNumber ? "active" : "")}>
                      {pageNumber}
                    </button>
                  </span>
                ))}
              </div>
              <Button type="button" size="sm" variant="outline" disabled={pageData.page >= pageData.totalPages}
                className="h-8 rounded-lg border-slate-300 bg-white px-2 text-slate-800"
                onClick={() => setPage(pageData.page + 1)}>
                Próxima <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </nav>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
