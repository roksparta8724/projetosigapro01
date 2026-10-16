import {
  Archive,
  ArchiveRestore,
  Clock3,
  Eye,
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
  const timelineAt = process.timeline?.[0]?.at;
  return timelineAt || process.analysis?.startedAt || "";
}

export function CompactProcessRegistry({
  processes,
  archivedProcessIds = [],
  onToggleArchive,
  emptyMessage = "Nenhum processo encontrado.",
  showArchiveAction = true,
  canDispatchProcess = () => true,
}: CompactProcessRegistryProps) {
  if (processes.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-950/50">
      <div className="hidden min-h-11 grid-cols-[42px_minmax(190px,1.25fr)_minmax(170px,1fr)_minmax(145px,.9fr)_minmax(135px,.8fr)_130px_154px] items-center gap-3 border-b border-slate-200 bg-slate-50/95 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 lg:grid dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400">
        <span className="text-center">Marc.</span>
        <span>Processo</span>
        <span>Interessado / imóvel</span>
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

          return (
            <div
              key={process.id}
              className={cn(
                "group grid gap-3 px-4 py-3.5 transition hover:bg-sky-50/45 lg:grid-cols-[42px_minmax(190px,1.25fr)_minmax(170px,1fr)_minmax(145px,.9fr)_minmax(135px,.8fr)_130px_154px] lg:items-center dark:hover:bg-sky-950/15",
                archived && "bg-slate-50/70 opacity-80 dark:bg-slate-900/35",
              )}
            >
              <div className="flex items-center gap-2 lg:justify-center">
                <span className="lg:hidden text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  Marcador
                </span>
                {marker ? (
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-sm"
                    style={{
                      borderColor: `${marker.color || "#2563eb"}40`,
                      backgroundColor: `${marker.color || "#2563eb"}12`,
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
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600"
                    title="Sem marcador"
                  >
                    <Flag className="h-4 w-4" />
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <Link
                  to={`/processos/${process.id}`}
                  className="block truncate text-[13px] font-black text-sky-800 underline-offset-4 hover:underline dark:text-sky-300"
                  title={formatOfficialProcessNumber(process.protocol)}
                >
                  {formatOfficialProcessNumber(process.protocol)}
                </Link>
                <p
                  className="mt-1 truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100"
                  title={formatOfficialProcessTitle({ title: process.title, type: process.type })}
                >
                  {formatOfficialProcessTitle({ title: process.title, type: process.type })}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn("h-5 rounded-full px-2 text-[9px] font-bold", statusTone(process.status))}>
                    {statusLabel(process.status)}
                  </Badge>
                  {marker ? (
                    <span
                      className="inline-flex max-w-[150px] items-center rounded-full border px-2 py-0.5 text-[9px] font-bold"
                      style={{
                        borderColor: `${marker.color || "#2563eb"}35`,
                        color: marker.color || "#2563eb",
                        backgroundColor: `${marker.color || "#2563eb"}0d`,
                      }}
                      title={marker.label}
                    >
                      <span className="truncate">{marker.label}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100" title={process.ownerName}>
                      {process.ownerName || "Interessado não informado"}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400" title={process.address}>
                      {process.address || "Endereço não informado"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <Workflow className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
                  <p className="line-clamp-2 text-[11px] font-semibold leading-4 text-slate-700 dark:text-slate-200" title={flow}>
                    {flow}
                  </p>
                </div>
              </div>

              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200" title={analyst}>
                  {analyst}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {process.analysis?.startedAt ? "Análise registrada" : "Responsável técnico"}
                </p>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                  <span>{formatDateTime(latestMovementAt(process))}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-xl px-2.5 text-[10px] font-bold"
                  title="Abrir processo"
                >
                  <Link to={`/processos/${process.id}`}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Abrir
                  </Link>
                </Button>

                {canDispatchProcess(process) ? (
                  <Button
                    asChild
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-xl border-sky-200 bg-sky-50 px-2.5 text-[10px] font-bold text-sky-800 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-200"
                    title="Abrir área de despacho"
                  >
                    <Link to={`/processos/${process.id}?aba=historico#despacho`}>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Despachar
                    </Link>
                  </Button>
                ) : null}

                <Button
                  asChild
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl"
                  title="Ver histórico"
                >
                  <Link to={`/processos/${process.id}?aba=historico`}>
                    <History className="h-3.5 w-3.5" />
                  </Link>
                </Button>

                {showArchiveAction && onToggleArchive ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl"
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
