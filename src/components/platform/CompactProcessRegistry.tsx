import {
  Archive,
  ArchiveRestore,
  Clock3,
  Flag,
  History,
  Send,
  UserRound,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildProcessPath,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  parseMarker,
  statusLabel,
  statusTone,
  type ProcessRecord,
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
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function currentFlowLabel(process: ProcessRecord) {
  return (
    process.processControl?.currentFolder ||
    process.dispatches[0]?.to ||
    process.sla.currentStage ||
    statusLabel(process.status)
  );
}

function latestMovementAt(process: ProcessRecord) {
  return process.timeline?.[0]?.at || process.analysis?.startedAt || "";
}

export function CompactProcessRegistry({
  processes,
  archivedProcessIds = [],
  onToggleArchive,
  emptyMessage = "Nenhum processo encontrado.",
  showArchiveAction = true,
  canDispatchProcess = () => true,
  detailPathSuffix = "",
}: CompactProcessRegistryProps) {
  if (processes.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50/80 px-5 py-7 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      data-sei-process-registry="true"
      className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.055)] dark:border-slate-700 dark:bg-slate-950/50"
    >
      <div className="hidden min-h-9 grid-cols-[30px_minmax(165px,1.15fr)_minmax(190px,1.35fr)_minmax(145px,.85fr)_minmax(120px,.75fr)_104px_112px] items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-3 text-[9px] font-black uppercase tracking-[0.11em] text-slate-500 lg:grid dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400">
        <span className="text-center">Marc.</span>
        <span>Processo</span>
        <span>Interessado / assunto</span>
        <span>Unidade atual</span>
        <span>Responsável</span>
        <span>Movimento</span>
        <span className="text-right">Ações</span>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {processes.map((process) => {
          const marker = process.tags?.[0] ? parseMarker(process.tags[0]) : null;
          const archived = archivedProcessIds.includes(process.id);
          const flow = currentFlowLabel(process);
          const analyst = process.analysis?.assignedTo || process.technicalLead || "Não atribuído";
          const detailPath = `${buildProcessPath(process)}${detailPathSuffix}`;

          return (
            <div
              key={process.id}
              data-sei-process-row="true"
              className={cn(
                "group grid gap-2 px-3 py-2.5 transition-colors hover:bg-sky-50/55 lg:grid-cols-[30px_minmax(165px,1.15fr)_minmax(190px,1.35fr)_minmax(145px,.85fr)_minmax(120px,.75fr)_104px_112px] lg:items-center dark:hover:bg-sky-950/15",
                archived && "bg-slate-50/70 opacity-80 dark:bg-slate-900/35",
              )}
            >
              <div className="flex items-center gap-2 lg:justify-center">
                <span className="lg:hidden text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  Marcador
                </span>
                {marker ? (
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                    style={{
                      borderColor: `${marker.color || "#2563eb"}42`,
                      backgroundColor: `${marker.color || "#2563eb"}10`,
                    }}
                    title={marker.label}
                  >
                    <Flag
                      className="h-4 w-4"
                      style={{
                        color: marker.color || "#2563eb",
                        fill: marker.color || "#2563eb",
                      }}
                    />
                  </span>
                ) : (
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600"
                    title="Sem marcador"
                  >
                    <Flag className="h-4 w-4" />
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <Link
                  to={detailPath}
                  data-sei-process-link="true"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-[12px] font-black text-[#075985] underline decoration-sky-300/70 decoration-1 underline-offset-[3px] hover:text-[#0369a1] hover:decoration-sky-600 dark:text-sky-300 dark:decoration-sky-500/50"
                  title={`Abrir ${formatOfficialProcessNumber(process.protocol)}`}
                >
                  {formatOfficialProcessNumber(process.protocol)}
                </Link>
                <div className="mt-1 flex min-w-0 items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "min-h-[24px] shrink-0 rounded-full px-2.5 text-[11px] font-bold",
                      statusTone(process.status),
                    )}
                  >
                    {statusLabel(process.status)}
                  </Badge>
                  {marker ? (
                    <span
                      className="max-w-[145px] truncate text-[12px] font-semibold"
                      style={{ color: marker.color || "#2563eb" }}
                      title={marker.label}
                    >
                      {marker.label}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p
                      className="truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100"
                      title={process.ownerName}
                    >
                      {process.ownerName || "Interessado não informado"}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400"
                      title={formatOfficialProcessTitle({ title: process.title, type: process.type })}
                    >
                      {formatOfficialProcessTitle({ title: process.title, type: process.type })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <Workflow className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
                  <p
                    className="truncate text-[10.5px] font-semibold text-slate-700 dark:text-slate-200"
                    title={flow}
                  >
                    {flow}
                  </p>
                </div>
              </div>

              <div className="min-w-0">
                <p
                  className="truncate text-[10.5px] font-semibold text-slate-700 dark:text-slate-200"
                  title={analyst}
                >
                  {analyst}
                </p>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[9.5px] font-medium text-slate-500 dark:text-slate-400">
                  <Clock3 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{formatDateTime(latestMovementAt(process))}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1">
                {canDispatchProcess(process) ? (
                  <Button
                    asChild
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-sky-700 hover:bg-sky-100 hover:text-sky-900 dark:text-sky-300 dark:hover:bg-sky-950/40"
                    title="Despachar processo"
                  >
                    <Link to={`${buildProcessPath(process, "historico")}#despacho`}>
                      <Send className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}

                <Button
                  asChild
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  title="Ver histórico"
                >
                  <Link to={buildProcessPath(process, "historico")}>
                    <History className="h-3.5 w-3.5" />
                  </Link>
                </Button>

                {showArchiveAction && onToggleArchive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg"
                    onClick={() => onToggleArchive(process.id, !archived)}
                    title={archived ? "Restaurar na lista" : "Arquivar da minha lista"}
                  >
                    {archived ? (
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
