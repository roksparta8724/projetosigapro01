import { Archive, ArchiveRestore } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PremiumProcessRegistry as CompactProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import { PageShell } from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { Button } from "@/components/ui/button";
import { useMarkerPresets, formatMarkerLabel } from "@/hooks/useMarkerPresets";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useLivePlatformRefresh } from "@/hooks/useLivePlatformRefresh";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  isInternalRole, isProcessOwnedBySessionDepartment, matchesOperationalScope,
  type ProcessRecord,
} from "@/lib/platform";

export function MunicipalProcessRegistryPage() {
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const {
    processes: allProcesses,
    refreshRemoteStore,
    remoteSyncedForCurrentUser,
    dataError: platformDataError,
    loading: platformDataLoading,
    addProcessMarkerWithColor,
  } = usePlatformData();
  const { presets } = useMarkerPresets();
  const [bulkMarkerBusy, setBulkMarkerBusy] = useState(false);
  const [bulkMarkerMessage, setBulkMarkerMessage] = useState("");
  // The signed-in account owns the municipal operational scope. A branding
  // cache or old selected tenant must not override its current municipality.
  const effectiveScopeId = session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null;
  useLivePlatformRefresh(refreshRemoteStore, { intervalMs: 30000, refreshOnMount: false });

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

  // One source for the municipal list. The premium workspace owns search,
  // quick filters and pagination; no second search/filter or KPI bar is mounted.
  const visibleProcesses = useMemo(
    () => showArchived
      ? municipalityProcesses.filter((process) => archivedProcessIds.includes(process.id))
      : municipalityProcesses,
    [municipalityProcesses, archivedProcessIds, showArchived],
  );
  const selectedVisibleIds = visibleProcesses
    .filter((process) => selectedProcessIds.includes(process.id))
    .map((process) => process.id);

  const applyMarkerToSelected = async (
    selected: ProcessRecord[], marker: { label: string; color: string },
  ) => {
    if (bulkMarkerBusy || !remoteSyncedForCurrentUser) {
      throw new Error("Aguarde a sincronização oficial antes de marcar.");
    }
    const scopedIds = new Set(visibleProcesses.map((process) => process.id));
    const selectedIds = new Set(selected.map((process) => process.id));
    if (selectedIds.size === 0 || selectedIds.size > 25 || selectedIds.size !== selected.length ||
        selected.some((process) => !scopedIds.has(process.id))) {
      setBulkMarkerMessage("Selecione até 25 processos válidos no município para aplicar marcadores.");
      throw new Error("Seleção inválida ou fora do escopo.");
    }
    if (session.role === "prefeitura_admin" ||
        !selected.every((process) => isProcessOwnedBySessionDepartment(session, process))) {
      setBulkMarkerMessage("A marcação exige autorização setorial em todos os processos selecionados.");
      throw new Error("Permissão insuficiente para marcação.");
    }

    setBulkMarkerBusy(true);
    setBulkMarkerMessage("");
    let succeeded = 0;
    try {
      for (const process of selected) {
        await addProcessMarkerWithColor(
          process.id,
          marker.emoji?.trim() ? marker.emoji.trim() + " " + marker.label : marker.label,
          marker.color,
          session.name,
        );
        succeeded += 1;
      }
      setSelectedProcessIds((current) => current.filter((id) => !selectedIds.has(id)));
      setBulkMarkerMessage(`Marcador aplicado a ${succeeded} processo(s) com registro individual.`);
    } catch (error) {
      setBulkMarkerMessage(
        `Marcação interrompida: ${succeeded} de ${selected.length} processo(s) confirmados. Confira os registros antes de repetir.`,
      );
      throw error;
    } finally {
      setBulkMarkerBusy(false);
    }
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
    <PortalFrame eyebrow="CONTROLE DE PROCESSOS" title="Processos da Prefeitura" hideSectionHeader>
      <PageShell>
        {!remoteSyncedForCurrentUser ? (
          <div role={platformDataError ? "alert" : "status"}
            data-municipal-registry-sync={platformDataError ? "error" : "pending"}
            className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-900">
            <div className="min-w-0">
              <p className="font-bold">{platformDataError ? "Banco oficial ainda não sincronizado" : "Sincronizando o cadastro oficial de processos..."}</p>
              <p className="mt-1 text-xs text-slate-700">
                {platformDataError || (platformDataLoading
                  ? "Conferindo processos, guias e prefeitura com o Neon."
                  : "Aguardando os registros do município. O cache do navegador não define o total oficial.")}
              </p>
            </div>
            <Button type="button" variant="outline"
              onClick={() => { void refreshRemoteStore().catch(() => undefined); }}>
              Atualizar do banco
            </Button>
          </div>
        ) : null}

        <CompactProcessRegistry
          operatorName={session.name}
          processes={visibleProcesses}
          markerOptions={presets.filter((preset) => preset.active).map((preset) => ({
            label: formatMarkerLabel(preset), color: preset.color || "#2563eb", emoji: preset.emoji,
          }))}
          onBulkMarker={session.role === "prefeitura_admin" ? undefined : applyMarkerToSelected}
          selectedProcessIds={selectedProcessIds}
          onToggleSelection={(processId, selected) => setSelectedProcessIds((current) => selected
            ? Array.from(new Set([...current, processId]))
            : current.filter((id) => id !== processId))}
          archivedProcessIds={archivedProcessIds}
          onToggleArchive={setProcessArchived}
          canDispatchProcess={(process) => session.role !== "prefeitura_admin" &&
            isProcessOwnedBySessionDepartment(session, process)}
          emptyMessage={showArchived
            ? "Nenhum processo arquivado nesta lista."
            : remoteSyncedForCurrentUser
              ? "Nenhum processo corresponde aos filtros atuais."
              : "Aguardando sincronização oficial — os processos não foram excluídos."}
        />

        {bulkMarkerMessage ? (
          <p role="status" className="mt-2 text-xs font-semibold text-sky-900 dark:text-sky-200">
            {bulkMarkerMessage}
          </p>
        ) : null}

        {/* Archive tools remain available without duplicating the reference toolbar.
            Personal archive never changes an official process or municipality data. */}
        <details data-sei-personal-archive-controls="true"
          className="mt-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <summary className="cursor-pointer font-semibold">
            Arquivo pessoal ({archivedProcessIds.length}) — organizar minha lista
          </summary>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-8"
              onClick={() => { setShowArchived((current) => !current); setSelectedProcessIds([]); }}>
              {showArchived ? <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> : <Archive className="mr-1.5 h-3.5 w-3.5" />}
              {showArchived ? "Voltar a todos os processos" : "Mostrar arquivados"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8"
              disabled={!selectedVisibleIds.length} onClick={() => archiveSelected(true)}>
              Arquivar da minha lista
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8"
              disabled={!selectedVisibleIds.length} onClick={() => archiveSelected(false)}>
              Restaurar da minha lista
            </Button>
            <span className="text-[11px] text-slate-500 dark:text-slate-300">
              Seleção e arquivamento pessoais, sem alterar tramitação ou status oficial.
            </span>
          </div>
        </details>
      </PageShell>
    </PortalFrame>
  );
}
