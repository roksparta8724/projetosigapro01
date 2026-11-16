import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { CompactProcessRegistry } from "@/components/platform/CompactProcessRegistry";
import {
  ProcessWorkspaceHeader, processIsCritical, processHasRequirement, processPendingGuideCount,
  processAwaitsDecision, type ProcessQuickFilter, type ProcessMarkerOption,
} from "@/components/platform/ProcessWorkspaceHeader";
import { statusLabel, formatOfficialProcessNumber, formatOfficialProcessTitle, type ProcessRecord } from "@/lib/platform";
import "@/styles/sigapro-process-workspace.css";

type RegistryProps = ComponentProps<typeof CompactProcessRegistry>;
type PremiumProcessRegistryProps = RegistryProps & {
  operatorName?: string;
  onBulkMarker?: (selected: ProcessRecord[], marker: ProcessMarkerOption) => Promise<void>;
  markerOptions?: ProcessMarkerOption[];
  onBulkDispatch?: (selected: ProcessRecord[]) => void;
};

export function PremiumProcessRegistry({
  processes, operatorName = "", selectedProcessIds, onToggleSelection,
  onBulkMarker, markerOptions = [], onBulkDispatch,
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
  const exportCsv = () => {
    if (!showSensitiveDetails || !filtered.length || typeof document === "undefined") return;
    const cell = (value: unknown) => {
      const str = String(value ?? "");
      const protectedValue = /^\s*[=+@-]/.test(str) ? "'" + str : str;
      return '"' + protectedValue.replace(/"/g, '""') + '"';
    };
    const rows = [
      ["Processo", "Assunto", "Interessado", "Etapa", "Responsável", "Prazo", "Guias pendentes"].map(cell).join(";"),
      ...filtered.map(p => [
        formatOfficialProcessNumber(p.protocol),
        formatOfficialProcessTitle({ title: p.title, type: p.type }),
        p.ownerName, statusLabel(p.status), p.analysis?.assignedTo || p.technicalLead,
        p.sla?.dueDate, processPendingGuideCount(p),
      ].map(cell).join(";")),
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "sigapro-processos.csv";
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
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
        onBulkDispatch={onBulkDispatch ? () => onBulkDispatch(visibleSelected) : undefined}
        onExport={exportCsv}
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
