import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Archive, ArchiveRestore, CalendarClock, ChevronLeft,
  ChevronRight, Clock3, ExternalLink, FileWarning, Flag, History,
  MoreHorizontal, Send, Workflow,
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
};

const gridWithoutSelection =
  "xl:grid-cols-[44px_minmax(130px,1.05fr)_minmax(160px,1.45fr)_minmax(125px,.95fr)_minmax(115px,.95fr)_100px_120px_144px]";
const gridWithSelection =
  "xl:grid-cols-[86px_minmax(130px,1.05fr)_minmax(160px,1.45fr)_minmax(125px,.95fr)_minmax(115px,.95fr)_100px_120px_144px]";
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

/**
 * The same responsive process-control workspace is reused by dashboard,
 * municipality administration and process registry. It never fetches another
 * municipality, changes permissions or performs implicit bulk decisions.
 *
 * At small widths the record becomes a compact grid, while desktop uses one
 * dense fixed-alignment row with horizontal overflow only when necessary.
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
}: CompactProcessRegistryProps) {
  const pageSizeControlId = useId();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const pageData = useMemo(
    () => paginateMunicipalItems(processes, page, pageSize),
    [processes, page, pageSize],
  );
  useEffect(() => {
    if (page !== pageData.page) setPage(pageData.page);
  }, [page, pageData.page]);

  const selectable = Boolean(onToggleSelection);
  const currentPageIds = pageData.items.map((process) => process.id);
  const selectedSet = useMemo(() => new Set(selectedProcessIds), [selectedProcessIds]);
  const checkedCount = currentPageIds.filter((id) => selectedSet.has(id)).length;
  const allPageSelected = currentPageIds.length > 0 && checkedCount === currentPageIds.length;
  const grid = selectable ? gridWithSelection : gridWithoutSelection;

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
      className="min-w-0 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.075)] dark:border-slate-700 dark:bg-slate-950">
      <div className="min-w-0 overflow-x-auto" tabIndex={0} aria-label="Tabela de processos; use a rolagem horizontal em telas pequenas">
        <div className="min-w-[995px] xl:min-w-[1040px]">
          <div className={cn(
            "hidden min-h-11 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 text-[10px] font-bold uppercase tracking-[0.045em] text-slate-600 xl:grid dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
            grid,
          )}>
            <div className="flex min-w-0 items-center justify-center gap-2" title="Marcador">
              {selectable ? (
                <input type="checkbox" checked={allPageSelected}
                  aria-label="Selecionar processos desta página"
                  onChange={(event) => currentPageIds.forEach((id) => onToggleSelection?.(id, event.target.checked))}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-sky-800" />
              ) : null}
              <Flag className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">Marcador</span>
            </div>
            <span>Nº do processo</span>
            <span>Assunto / interessado</span>
            <span>Etapa atual</span>
            <span>Responsável</span>
            <span>Prazo</span>
            <span>Pendências</span>
            <span className="text-right">Ações</span>
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
              const selected = selectedSet.has(process.id);
              return (
                <div role="listitem" key={process.id} data-sei-process-row="true"
                  className={cn(
                    "group grid min-w-0 gap-2 px-3 py-2.5 transition-colors xl:items-center",
                    grid,
                    index % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50/55 dark:bg-slate-900/65",
                    "hover:bg-sky-50/80 dark:hover:bg-sky-950/30",
                    archived && "opacity-75",
                    selected && "bg-sky-100/70 dark:bg-sky-950/40",
                  )}>
                  <div className="flex min-w-0 flex-wrap items-center justify-center gap-1" aria-label="Marcadores do processo">
                    {selectable ? (
                      <input type="checkbox" checked={selected}
                        onChange={(event) => onToggleSelection?.(process.id, event.target.checked)}
                        aria-label={"Selecionar processo " + number}
                        className="mr-1 h-4 w-4 shrink-0 cursor-pointer accent-sky-800" />
                    ) : null}
                    {markers.slice(0, 3).map((item, markerIndex) => (
                      <span key={markerIndex} title={item.label} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border"
                        style={{ color: item.color, borderColor: item.color + "66", backgroundColor: item.color + "16" }}>
                        <Flag className="h-3.5 w-3.5" fill="currentColor" />
                      </span>
                    ))}
                    {markers.length > 3 ? (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-white" title="Marcadores adicionais">
                        +{markers.length - 3}
                      </span>
                    ) : null}
                    {!marker && fact.urgent ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" aria-label="Prazo crítico" />
                    ) : null}
                    {!marker && !fact.urgent ? (
                      <Flag className="h-4 w-4 shrink-0 text-slate-400" aria-label="Sem marcador" />
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <Link to={detailPath} data-sei-process-link="true"
                      className="inline-block max-w-full truncate align-middle text-[12px] font-extrabold leading-5 text-sky-900 underline decoration-sky-300 underline-offset-[3px] hover:text-sky-700 dark:text-sky-200"
                      title={"Abrir " + number}>{number}</Link>
                    {marker ? (
                      <p title={marker.label} className="mt-0.5 max-w-full truncate text-[10px] font-semibold text-slate-600 dark:text-slate-300">{marker.label}</p>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <p title={title} className="max-w-full truncate text-[12px] font-semibold leading-5 text-slate-900 dark:text-white">{title}</p>
                    {showSensitiveDetails ? (
                      <p title={process.ownerName} className="mt-0.5 max-w-full truncate text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        {process.ownerName || "Interessado não informado"}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <Badge variant="outline" className={cn("max-w-full truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold", statusTone(process.status))} title={statusLabel(process.status)}>
                      <Workflow className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
                      {statusLabel(process.status)}
                    </Badge>
                    <p title={visibleFlow} className="mt-1 max-w-full truncate text-[10px] text-slate-500 dark:text-slate-300">{visibleFlow}</p>
                  </div>

                  <div className="min-w-0">
                    <p title={analyst} className="max-w-full truncate text-[11px] font-semibold leading-5 text-slate-700 dark:text-slate-200">{analyst}</p>
                  </div>

                  <div className="min-w-0">
                    <span title={fact.due || "Prazo não informado"}
                      className={cn("inline-flex max-w-full items-center gap-1 rounded-lg border px-1.5 py-1 text-[10px] font-semibold tabular-nums",
                        fact.urgent ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200")}>
                      <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{restrictedExternal ? "Consultar etapa" : (fact.due || "Sem prazo")}</span>
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-wrap items-center gap-1">
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

                  <div className="flex min-w-0 items-center justify-end gap-1">
                    <Button asChild size="sm"
                      className="h-8 shrink-0 rounded-lg bg-[#0b3e67] px-2.5 text-[10px] font-bold !text-white hover:bg-[#075985]">
                      <Link to={detailPath} aria-label={"Abrir processo " + number}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Abrir processo
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-lg border-slate-300"
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
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50/90 px-3 py-3 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite">
            Exibindo {pageData.start + 1}–{pageData.end} de {pageData.total.toLocaleString("pt-BR")} processos
          </span>
          <span className="hidden sm:inline">· Marcadores: <Flag className="inline h-3 w-3 text-sky-700" /> Salvos</span>
          <span className="hidden md:inline">· <AlertTriangle className="inline h-3 w-3 text-rose-600" /> SLA</span>
          <span className="hidden md:inline">· <FileWarning className="inline h-3 w-3 text-amber-600" /> Exigência</span>
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
              <span className="min-w-[90px] text-center font-semibold" aria-live="polite">Página {pageData.page} de {pageData.totalPages}</span>
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
