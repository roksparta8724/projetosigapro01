import {
  Archive,
  ListChecks,
  Search,
  ScrollText,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { CompactProcessRegistry } from "@/components/platform/CompactProcessRegistry";
import { PageHeader } from "@/components/platform/PageHeader";
import { PageShell, PageStatsRow } from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { StatCard } from "@/components/platform/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  isInternalRole,
  matchesOperationalScope,
  statusLabel,
  type ProcessRecord,
} from "@/lib/platform";

type RegistryFilter = "todos" | "ativos" | "concluidos";

const FINAL_STATUSES = new Set(["deferido", "indeferido", "cancelado", "arquivado"]);

function isFinalProcess(process: ProcessRecord) {
  return FINAL_STATUSES.has(String(process.status));
}

export function MunicipalProcessRegistryPage() {
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const { processes: allProcesses } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RegistryFilter>("todos");
  const [showArchived, setShowArchived] = useState(false);

  const archiveStorageKey = `sigapro:municipal-process-registry:${session.id}:${effectiveScopeId || "default"}`;
  const [archivedProcessIds, setArchivedProcessIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(archiveStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setArchivedProcessIds(
        Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === "string")
          : [],
      );
    } catch {
      setArchivedProcessIds([]);
    }
  }, [archiveStorageKey]);

  const setProcessArchived = (processId: string, archived: boolean) => {
    setArchivedProcessIds((current) => {
      const next = archived
        ? Array.from(new Set([...current, processId]))
        : current.filter((id) => id !== processId);
      window.localStorage.setItem(archiveStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const municipalityProcesses = useMemo(
    () =>
      allProcesses
        .filter((process) => matchesOperationalScope(effectiveScopeId, process))
        .sort((a, b) => {
          const aDate = Date.parse(a.timeline?.[0]?.at || a.analysis?.startedAt || "1970-01-01");
          const bDate = Date.parse(b.timeline?.[0]?.at || b.analysis?.startedAt || "1970-01-01");
          return bDate - aDate;
        }),
    [allProcesses, effectiveScopeId],
  );

  const activeCount = municipalityProcesses.filter((process) => !isFinalProcess(process)).length;
  const completedCount = municipalityProcesses.filter(isFinalProcess).length;
  const markedCount = municipalityProcesses.filter((process) => (process.tags?.length || 0) > 0).length;

  const visibleProcesses = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return municipalityProcesses.filter((process) => {
      const archived = archivedProcessIds.includes(process.id);
      if (showArchived !== archived) return false;
      if (filter === "ativos" && isFinalProcess(process)) return false;
      if (filter === "concluidos" && !isFinalProcess(process)) return false;

      if (!needle) return true;

      const haystack = [
        process.protocol,
        process.externalProtocol,
        process.title,
        process.ownerName,
        process.address,
        process.property?.iptu,
        process.analysis?.assignedTo,
        process.processControl?.currentFolder,
        process.sla?.currentStage,
        statusLabel(process.status),
        ...(process.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [archivedProcessIds, filter, municipalityProcesses, search, showArchived]);

  if (!isInternalRole(session.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <PortalFrame eyebrow="CONTROLE DE PROCESSOS" title="Processos da Prefeitura">
      <PageShell>
        <PageHeader
          eyebrow="Registro municipal"
          title="Controle de Processos"
          description="Visualize todos os processos da Prefeitura em uma lista compacta, alinhada e preparada para grande volume. As filas operacionais de cada setor continuam preservadas."
          icon={ScrollText}
        />

        <PageStatsRow>
          <StatCard
            label="Processos"
            value={String(municipalityProcesses.length)}
            helper="Registros do município"
            icon={ScrollText}
          />
          <StatCard
            label="Em andamento"
            value={String(activeCount)}
            helper="Fluxo operacional ativo"
            icon={ListChecks}
          />
          <StatCard
            label="Concluídos"
            value={String(completedCount)}
            helper="Finalizados ou encerrados"
            icon={ListChecks}
          />
          <StatCard
            label="Com marcador"
            value={String(markedCount)}
            helper="Marcador operacional único"
            icon={ListChecks}
          />
        </PageStatsRow>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_16px_38px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-950/45">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por processo, proprietário, endereço, IPTU, unidade, responsável ou marcador"
                className="h-11 rounded-2xl border-slate-200 bg-white pl-11 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {([
                ["todos", "Todos"],
                ["ativos", "Em andamento"],
                ["concluidos", "Concluídos"],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={filter === value ? "default" : "outline"}
                  className="h-10 rounded-full"
                  onClick={() => setFilter(value)}
                >
                  {label}
                </Button>
              ))}

              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full"
                onClick={() => setShowArchived((current) => !current)}
              >
                <Archive className="mr-2 h-4 w-4" />
                {showArchived
                  ? "Voltar à lista ativa"
                  : `Arquivados (${archivedProcessIds.length})`}
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs leading-5 text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-200">
            O número do processo é um link para a ficha completa. “Despachar” abre diretamente a área de movimentação do processo.
            O marcador exibido nesta lista é o mesmo marcador único gerenciado no topbar.
          </div>

          <div className="mt-4">
            <CompactProcessRegistry
              processes={visibleProcesses}
              archivedProcessIds={archivedProcessIds}
              onToggleArchive={setProcessArchived}
              emptyMessage={
                showArchived
                  ? "Nenhum processo arquivado nesta lista."
                  : "Nenhum processo corresponde aos filtros atuais."
              }
            />
          </div>
        </div>
      </PageShell>
    </PortalFrame>
  );
}
