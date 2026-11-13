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
import { useLivePlatformRefresh } from "@/hooks/useLivePlatformRefresh";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  isInternalRole,
  isProcessOwnedBySessionDepartment,
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
  const {
    processes: allProcesses,
    refreshRemoteStore,
    remoteSyncedForCurrentUser,
    dataError: platformDataError,
    loading: platformDataLoading,
  } = usePlatformData();
  // The signed-in account owns the municipal operational scope. A branding
  // cache or old selected tenant must not override its current municipality.
  const effectiveScopeId = session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null;
  useLivePlatformRefresh(refreshRemoteStore, { intervalMs: 30000, refreshOnMount: false });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RegistryFilter>("todos");
  const [showArchived, setShowArchived] = useState(false);

  const archiveStorageKey = `sigapro:municipal-process-registry:${session.id}:${effectiveScopeId || "default"}`;
  const [archivedProcessIds, setArchivedProcessIds] = useState<string[]>([]);
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([]);

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

  useEffect(() => {
    // Never carry a selection into another municipality or authenticated account.
    setSelectedProcessIds([]);
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
      (remoteSyncedForCurrentUser ? allProcesses : [])
        .filter(
          (process) =>
            process.isOfficial !== false &&
            matchesOperationalScope(effectiveScopeId, process),
        )
        .sort((a, b) => {
          const aDate = Date.parse(a.timeline?.[0]?.at || a.analysis?.startedAt || "1970-01-01");
          const bDate = Date.parse(b.timeline?.[0]?.at || b.analysis?.startedAt || "1970-01-01");
          return bDate - aDate;
        }),
    [allProcesses, effectiveScopeId, remoteSyncedForCurrentUser],
  );

  const activeCount = municipalityProcesses.filter((process) => !isFinalProcess(process)).length;
  const completedCount = municipalityProcesses.filter(isFinalProcess).length;
  const markedCount = municipalityProcesses.filter((process) => (process.tags?.length || 0) > 0).length;

  const visibleProcesses = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return municipalityProcesses.filter((process) => {
      const archived = archivedProcessIds.includes(process.id);
      // "Todos" is truly every official municipal process; personal archived
      // markers only filter when the user explicitly opens Arquivados.
      if (showArchived && !archived) return false;
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

  const visibleIds = visibleProcesses.map((process) => process.id);
  const selectedVisibleIds = visibleIds.filter((id) => selectedProcessIds.includes(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;
  const toggleVisibleSelection = (selected: boolean) => {
    setSelectedProcessIds((current) => selected
      ? Array.from(new Set([...current, ...visibleIds]))
      : current.filter((id) => !visibleIds.includes(id)));
  };
  const archiveSelected = (archived: boolean) => {
    if (selectedVisibleIds.length === 0) return;
    const selected = new Set(selectedVisibleIds);
    setArchivedProcessIds((current) => {
      const next = archived
        ? Array.from(new Set([...current, ...selectedVisibleIds]))
        : current.filter((id) => !selected.has(id));
      window.localStorage.setItem(archiveStorageKey, JSON.stringify(next));
      return next;
    });
    setSelectedProcessIds((current) => current.filter((id) => !selected.has(id)));
  };

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

        {!remoteSyncedForCurrentUser ? (
          <div role={platformDataError ? "alert" : "status"}
            data-municipal-registry-sync={platformDataError ? "error" : "pending"}
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-900">
            <div className="min-w-0">
              <p className="font-bold">
                {platformDataError ? "Banco oficial ainda não sincronizado" : "Sincronizando o cadastro oficial de processos..."}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                {platformDataError ||
                  (platformDataLoading
                    ? "Conferindo processos, guias e prefeitura com o Neon."
                    : "Aguardando os registros do município. O cache do navegador não define o total oficial.")}
              </p>
            </div>
            <Button type="button" variant="outline" className="border-slate-300 bg-white text-slate-900"
              onClick={() => { void refreshRemoteStore().catch(() => undefined); }}>
              Atualizar do banco
            </Button>
          </div>
        ) : null}

        <PageStatsRow>
          <StatCard
            label="Processos"
            value={String(municipalityProcesses.length)}
            description="Registros do município"
            icon={ScrollText}
          />
          <StatCard
            label="Em andamento"
            value={String(activeCount)}
            description="Fluxo operacional ativo"
            icon={ListChecks}
          />
          <StatCard
            label="Concluídos"
            value={String(completedCount)}
            description="Finalizados ou encerrados"
            icon={ListChecks}
          />
          <StatCard
            label="Com marcador"
            value={String(markedCount)}
            description="Marcador operacional único"
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
                  ? "Voltar a todos os processos"
                  : `Arquivados (${archivedProcessIds.length})`}
              </Button>
            </div>
          </div>

          <div data-sei-bulk-selection="true" className="mt-4 flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <input type="checkbox" className="h-4 w-4 accent-sky-700" checked={allVisibleSelected}
                onChange={(event) => toggleVisibleSelection(event.target.checked)} disabled={visibleIds.length === 0}
                aria-label="Selecionar todos os resultados filtrados" />
              Selecionar resultados
            </label>
            <span role="status" aria-live="polite" className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {selectedVisibleIds.length.toLocaleString("pt-BR")} selecionados
            </span>
            <Button type="button" variant="outline" size="sm" disabled={!selectedVisibleIds.length}
              onClick={() => archiveSelected(true)} className="rounded-lg border-slate-300 bg-white text-slate-900">Arquivar da minha lista</Button>
            <Button type="button" variant="outline" size="sm" disabled={!selectedVisibleIds.length}
              onClick={() => archiveSelected(false)} className="rounded-lg border-slate-300 bg-white text-slate-900">Restaurar da minha lista</Button>
            <Button type="button" variant="ghost" size="sm" disabled={!selectedVisibleIds.length}
              onClick={() => setSelectedProcessIds([])} className="rounded-lg text-slate-700 dark:text-slate-100">Desmarcar</Button>
            <p className="w-full text-xs leading-5 text-slate-600 dark:text-slate-300">
              A seleção e o arquivamento são pessoais, sem alterar tramitação ou status oficial. Para despachar, assinar ou decidir, abra a ficha do processo com o perfil autorizado.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs leading-5 text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-200">
            O número do processo é um link para a ficha completa. “Despachar” abre diretamente a área de movimentação do processo.
            O marcador exibido nesta lista é o mesmo marcador único gerenciado no topbar.
          </div>

          <div className="mt-4">
            <CompactProcessRegistry
              processes={visibleProcesses}
              selectedProcessIds={selectedProcessIds}
              onToggleSelection={(processId, selected) => setSelectedProcessIds((current) => selected
                ? Array.from(new Set([...current, processId]))
                : current.filter((id) => id !== processId))}
              archivedProcessIds={archivedProcessIds}
              onToggleArchive={setProcessArchived}
              canDispatchProcess={(process) => isProcessOwnedBySessionDepartment(session, process)}
              emptyMessage={
                showArchived
                  ? "Nenhum processo arquivado nesta lista."
                  : remoteSyncedForCurrentUser
                    ? "Nenhum processo corresponde aos filtros atuais."
                    : "Aguardando sincronização oficial — os processos não foram excluídos."
              }
            />
          </div>
        </div>
      </PageShell>
    </PortalFrame>
  );
}
