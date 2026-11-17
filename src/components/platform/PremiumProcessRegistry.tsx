import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { CompactProcessRegistry } from "@/components/platform/CompactProcessRegistry";
import {
  ProcessWorkspaceHeader, processIsCritical, processHasRequirement, processPendingGuideCount,
  processAwaitsDecision, processIsUnderAnalysis, processAwaitsInspection, type ProcessQuickFilter, type ProcessMarkerOption, type ProcessWorkspaceAction,
} from "@/components/platform/ProcessWorkspaceHeader";
import { statusLabel, formatOfficialProcessNumber, formatOfficialProcessTitle, type ProcessRecord } from "@/lib/platform";
import "@/styles/sigapro-process-workspace.css";
import "@/styles/sigapro-reference-layout.css";

type RegistryProps = ComponentProps<typeof CompactProcessRegistry>;
type PremiumProcessRegistryProps = RegistryProps & {
  operatorName?: string;
  onBulkMarker?: (selected: ProcessRecord[], marker: ProcessMarkerOption) => Promise<void>;
  markerOptions?: ProcessMarkerOption[];
  onBulkDispatch?: (selected: ProcessRecord[]) => void;
  onCreateMarker?: () => void;
  unitCompletedIds?: string[];
  unitDataReady?: boolean;
  onUnitAction?: (selected: ProcessRecord[], completed: boolean) => void;
  onToolbarAction?: (action: ProcessWorkspaceAction, selected: ProcessRecord[]) => void;
  exportScopeLabel?: string;
};

export function PremiumProcessRegistry({
  processes, operatorName = "", selectedProcessIds, onToggleSelection,
  onBulkMarker, markerOptions = [], onBulkDispatch,
  onCreateMarker, unitCompletedIds = [], unitDataReady, onUnitAction,
  onToolbarAction, exportScopeLabel = "Processos municipais",
  showSensitiveDetails = true, canDispatchProcess = () => false,
  ...rest
}: PremiumProcessRegistryProps) {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<ProcessQuickFilter>("todos");
  const [internalSelection, setInternalSelection] = useState<string[]>([]);
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const selectedIds = onToggleSelection ? selectedProcessIds ?? [] : internalSelection;
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    const operator = operatorName.trim().toLocaleLowerCase("pt-BR");
    return processes.filter(process => {
      const searchable = [
        process.protocol, process.externalProtocol, process.title, process.ownerName,
        process.technicalLead, process.analysis?.assignedTo, statusLabel(process.status),
        process.sla?.currentStage, process.processControl?.currentFolder, ...(process.tags ?? []),
      ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      if (needle && !searchable.includes(needle)) return false;
      if (quickFilter === "criticos") return processIsCritical(process);
      if (quickFilter === "pendencias") return processHasRequirement(process) || processPendingGuideCount(process) > 0;
      if (quickFilter === "guias") return processPendingGuideCount(process) > 0;
      if (quickFilter === "exigencias") return processHasRequirement(process);
      if (quickFilter === "analise") return processIsUnderAnalysis(process);
      if (quickFilter === "vistoria") return processAwaitsInspection(process);
      if (quickFilter === "decisao") return processAwaitsDecision(process);
      if (quickFilter === "meus") return Boolean(operator) && [
        process.technicalLead, process.analysis?.assignedTo,
      ].some(name => String(name ?? "").trim().toLocaleLowerCase("pt-BR") === operator);
      return true;
    });
  }, [processes, search, quickFilter, operatorName]);
  const visibleSelected = useMemo(() => {
    const ids = new Set(selectedIds);
    return filtered.filter(p => ids.has(p.id));
  }, [filtered, selectedIds]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedSet.has(id));
  const oneSelected = visibleSelected.length === 1 ? visibleSelected[0] : null;
  const toggleSelection = (id: string, checked: boolean) => {
    if (onToggleSelection) onToggleSelection(id, checked);
    else setInternalSelection(current => checked ? Array.from(new Set([...current, id])) : current.filter(key => key !== id));
  };
  const clearSelection = () => {
    if (onToggleSelection) selectedIds.forEach(id => onToggleSelection(id, false));
    else setInternalSelection([]);
  };
  const exportWorkbook = async (scope: "selected" | "filtered" = "filtered") => {
    if (!showSensitiveDetails || busy) return;
    const records = scope === "selected" ? visibleSelected : filtered;
    if (!records.length) {
      setFeedback("Selecione processos válidos ou use o resultado filtrado.");
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      // Actual XLSX: fixed columns, fonts, safe text, wrapped cells and filters.
      const { downloadPremiumProcessWorkbook } = await import("@/lib/processPremiumExcelExport");
      downloadPremiumProcessWorkbook(records, exportScopeLabel);
      setFeedback(`Planilha Excel premium gerada: ${records.length} processo(s) — ${scope === "selected" ? "selecionados" : "filtro atual"}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao gerar o Excel.");
    } finally {
      setBusy(false);
    }
  };
  const markSelected = async (marker: ProcessMarkerOption) => {
    if (!onBulkMarker || !visibleSelected.length || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      await onBulkMarker(visibleSelected, marker);
      clearSelection();
      setFeedback("Marcadores enviados para registro nos processos autorizados.");
    } catch {
      setFeedback("A marcação não foi confirmada integralmente. Confira os registros antes de repetir.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    // Never retain selected IDs when the list scope changes or drops records.
    const ids = new Set(processes.map(p => p.id));
    setInternalSelection(current => current.every(id => ids.has(id)) ? current : current.filter(id => ids.has(id)));
  }, [processes]);

  return (
    <section className="sig-workspace-shell min-w-0 w-full" data-sigapro-process-workspace="approved-premium-mockup">
      <ProcessWorkspaceHeader
        processes={processes} filteredCount={filtered.length}
        search={search} onSearch={setSearch}
        quickFilter={quickFilter} onFilter={setQuickFilter}
        operatorName={operatorName}
        selectedCount={visibleSelected.length}
        allPageSelected={allPageSelected} pageCount={pageIds.length}
        onTogglePage={checked => pageIds.forEach(id => toggleSelection(id, checked))}
        onClearSelection={clearSelection}
        oneSelected={oneSelected} canDispatch={canDispatchProcess}
        showSensitiveDetails={showSensitiveDetails} bulkBusy={busy}
        markerOptions={markerOptions}
        onBulkMarker={onBulkMarker ? marker => { void markSelected(marker); } : undefined}
        onCreateMarker={onCreateMarker}
        selectedProcesses={visibleSelected}
        unitCompletedIds={unitCompletedIds}
        unitDataReady={unitDataReady}
        onUnitAction={onUnitAction ? completed => onUnitAction(visibleSelected, completed) : undefined}
        onBulkDispatch={onBulkDispatch ? () => onBulkDispatch(visibleSelected) : undefined}
        onToolbarAction={onToolbarAction ? action => onToolbarAction(action, visibleSelected) : undefined}
        onExport={scope => { void exportWorkbook(scope); }}
      />
      {feedback ? <p role="status" className="mb-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-medium text-sky-900">{feedback}</p> : null}
      <CompactProcessRegistry
        {...rest}
        processes={filtered}
        selectedProcessIds={selectedIds}
        onToggleSelection={showSensitiveDetails ? toggleSelection : undefined}
        canDispatchProcess={canDispatchProcess}
        showSensitiveDetails={showSensitiveDetails}
        defaultPageSize={10}
        onVisiblePageChange={setPageIds}
      />
    </section>
  );
}
