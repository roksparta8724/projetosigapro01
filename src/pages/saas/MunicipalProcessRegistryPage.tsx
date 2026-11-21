import { Archive, ArchiveRestore, CheckCircle2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { PremiumProcessRegistry as CompactProcessRegistry } from "@/components/platform/PremiumProcessRegistry";
import { CreateProcessMarkerDialog, type CreatedPersonalMarker } from "@/components/platform/CreateProcessMarkerDialog";
import { ProcessBatchActionDialog, type ProcessBatchPayload } from "@/components/platform/ProcessBatchActionDialog";
import type { ProcessWorkspaceAction } from "@/components/platform/ProcessWorkspaceHeader";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PageShell } from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { Button } from "@/components/ui/button";
import { useMarkerPresets, formatMarkerLabel } from "@/hooks/useMarkerPresets";
import {
  listMyUnitProcessCompletions, setMyUnitProcessCompletion,
  type UnitProcessCompletion,
} from "@/integrations/backend/processUnitCompletionClient";
import { useMunicipality } from "@/hooks/useMunicipality";
import { useMunicipalOrganogram } from "@/hooks/useMunicipalOrganogram";
import { usePlatformData } from "@/hooks/usePlatformData";
import {
  canApplyPersonalProcessMarker, composeProfessionalMarkerLabel,
  PERSONAL_PROCESS_MARKER_LIMIT_ERROR,
} from "@/lib/processMarkerLimits";
import { useLivePlatformRefresh } from "@/hooks/useLivePlatformRefresh";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  isInternalRole, isProcessOwnedBySessionDepartment, matchesOperationalScope, parseMarker,
  resolveSessionOperationalArea,
  type ProcessRecord,
} from "@/lib/platform";

export function MunicipalProcessRegistryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const {
    processes: allProcesses,
    refreshRemoteStore,
    remoteSyncedForCurrentUser,
    dataError: platformDataError,
    loading: platformDataLoading,
    addProcessMarkerWithColor,
    removeProcessMarker,
    sessionUsers,
    assignProcessAnalysis,
    reassignProcessAnalysis,
    dispatchProcess,
  } = usePlatformData();
  const { presets, addPreset } = useMarkerPresets();
  const { departments: municipalDepartments } = useMunicipalOrganogram(
    session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null
  );
  const [activeBatchAction, setActiveBatchAction] = useState<ProcessWorkspaceAction | null>(null);
  const [batchSelected, setBatchSelected] = useState<ProcessRecord[]>([]);
  const [batchActionFeedback, setBatchActionFeedback] = useState("");
  const [createMarkerOpen, setCreateMarkerOpen] = useState(false);
  const [unitView, setUnitView] = useState<"todos" | "abertos" | "concluidos">("todos");
  const [unitCompletions, setUnitCompletions] = useState<Record<string, UnitProcessCompletion>>({});
  const [unitSyncState, setUnitSyncState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [unitError, setUnitError] = useState("");
  const [unitFeedback, setUnitFeedback] = useState("");
  const [unitActionBusy, setUnitActionBusy] = useState(false);
  const [pendingUnitAction, setPendingUnitAction] =
    useState<{ processes: ProcessRecord[]; completed: boolean } | null>(null);
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
  const mayOperate = isInternalRole(session.role) && session.role !== "prefeitura_admin";
  const unitName = session.department?.trim() || session.title?.trim() || "unidade atual";
  // SEI: after a dispatch the process leaves this unit's active queue, but
  // its sender may still conclude that unit's own attendance. Backend RPC
  // validates the exact unit/tenant and dispatch history before writing.
  const canCompleteInMyUnit = (process: ProcessRecord) => {
    if (isProcessOwnedBySessionDepartment(session, process)) return true;
    if (!mayOperate) return false;
    const normalize = (text: string) => text.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
    const ownDepartment = session.department?.trim();
    const ownArea = resolveSessionOperationalArea(session);
    return (process.dispatches ?? []).some(dispatch => {
      if (!dispatch.from?.trim()) return false;
      if (ownDepartment && normalize(dispatch.from) === normalize(ownDepartment)) return true;
      const dispatchArea = resolveSessionOperationalArea({
        ...session, department: dispatch.from, title: "",
      });
      if (!ownArea || dispatchArea !== ownArea) return false;
      // A department with another registered name is not automatically the
      // same unit. Only the authenticated creator can close its own dispatch.
      // The Neon RPC repeats this authorization before writing an audit entry.
      return !ownDepartment || dispatch.requestedByProfileId === session.id;
    });
  };

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

  useEffect(() => {
    // Local completion is official Neon data. Never infer it from localStorage,
    // process.status or a previous account's cached store.
    setUnitCompletions({});
    setUnitView("todos");
    setUnitSyncState("loading");
    setUnitError("");
    if (!remoteSyncedForCurrentUser || !mayOperate || !effectiveScopeId) return;
    let active = true;
    void listMyUnitProcessCompletions().then(rows => {
      if (!active) return;
      setUnitCompletions(Object.fromEntries(rows.map(row => [row.process_id, row])));
      setUnitSyncState("ready");
    }).catch(error => {
      if (!active) return;
      setUnitSyncState("unavailable");
      setUnitError(error instanceof Error ? error.message : "Não foi possível verificar as unidades.");
    });
    return () => { active = false; };
  }, [archiveStorageKey, effectiveScopeId, mayOperate, remoteSyncedForCurrentUser]);

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

  // Unit views are distinct from the GLOBAL municipal process status.
  // A local conclusion hides the process only from the active unit work queue.
  const visibleProcesses = useMemo(() => {
    const base = showArchived
      ? municipalityProcesses.filter(process => archivedProcessIds.includes(process.id))
      : municipalityProcesses;
    if (unitSyncState !== "ready" || unitView === "todos") return base;
    if (unitView === "concluidos") {
      return base.filter(process => unitCompletions[process.id]?.status === "concluido");
    }
    return base.filter(process =>
      isProcessOwnedBySessionDepartment(session, process) &&
      unitCompletions[process.id]?.status !== "concluido"
    );
  }, [municipalityProcesses, archivedProcessIds, showArchived,
      unitSyncState, unitView, unitCompletions, session]);
  // Restore selection/action handed off from the premium table in municipal
  // overview, analyst desk or protocol desk. No act is executed by the
  // originating consultation view. IDs are verified against the authenticated
  // municipality, then the existing authorized dialog/RPC is used.
  useEffect(() => {
    const state = location.state as
      | { sigaproProcessBatchRequest?: { action?: unknown; processIds?: unknown } }
      | null;
    const request = state?.sigaproProcessBatchRequest;
    if (!request || !remoteSyncedForCurrentUser) return;
    const action = request.action;
    const knownActions: Array<ProcessWorkspaceAction | "concluir"> =
      ["prioridade", "atribuir", "encaminhar", "decisao", "etiquetas", "concluir"];
    const ids = request.processIds;
    const validIds = Array.isArray(ids) && ids.length > 0 && ids.length <= 25 &&
      ids.every(id => typeof id === "string" && id.length > 0) &&
      new Set(ids).size === ids.length;
    const validAction = knownActions.some(known => known === action);
    if (validAction && validIds && action === "concluir" &&
        mayOperate && unitSyncState === "loading") return;

    const clearRequest = () => navigate(location.pathname + location.search, {
      replace: true, state: null,
    });
    if (!validAction || !validIds) {
      setBatchActionFeedback("A seleção recebida é inválida. Selecione os processos novamente.");
      clearRequest();
      return;
    }

    const selected = (ids as string[]).map(id =>
      municipalityProcesses.find(process => process.id === id)
    );
    if (selected.some(process => !process)) {
      setBatchActionFeedback(
        "Um dos processos não está disponível neste município. A seleção não foi executada."
      );
      clearRequest();
      return;
    }
    const selectedProcesses = selected as ProcessRecord[];
    setSelectedProcessIds(ids as string[]);
    if (action === "concluir") {
      if (!mayOperate) {
        setUnitError(
          "Este perfil é somente consulta. Entre com a conta funcional da unidade para concluir o atendimento."
        );
      } else if (unitSyncState !== "ready") {
        setUnitError(
          "A conclusão da unidade não está disponível no banco. Verifique a sincronização oficial."
        );
      } else if (!selectedProcesses.every(canCompleteInMyUnit)) {
        setUnitError(
          "A conclusão exige vínculo com a unidade atual ou autoria comprovada do encaminhamento."
        );
      } else {
        setUnitError("");
        setPendingUnitAction({ processes: selectedProcesses, completed: true });
      }
    } else {
      setBatchActionFeedback("");
      setBatchSelected(selectedProcesses);
      setActiveBatchAction(action as ProcessWorkspaceAction);
    }
    clearRequest();
  // Clear router state before dialogs mutate local state; a new render must
  // never reopen the same one-time request or submit a duplicate operation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.pathname, location.search, municipalityProcesses,
      remoteSyncedForCurrentUser, mayOperate, unitSyncState, navigate]);

  const selectedVisibleIds = visibleProcesses
    .filter((process) => selectedProcessIds.includes(process.id))
    .map((process) => process.id);

  const applyMarkerToSelected = async (
    selected: ProcessRecord[], marker: { label: string; color: string; emoji?: string },
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
    // Personal markers are not municipal dispatch/decision acts. An internal
    // professional may organize any municipal process they can view. The RPC
    // still checks the authenticated account, tenant and personal marker limit.
    if (!mayOperate) {
      setBulkMarkerMessage("Esta conta possui somente consulta. Utilize um perfil profissional interno autorizado.");
      throw new Error("Perfil sem permissão para marcadores pessoais.");
    }

    const actualLabel = composeProfessionalMarkerLabel(marker.label, marker.emoji);
    const full = selected.filter(process =>
      !canApplyPersonalProcessMarker(process.tags ?? [], actualLabel)
    );
    if (full.length > 0) {
      const message = `${PERSONAL_PROCESS_MARKER_LIMIT_ERROR} ${full.length} processo(s) da seleção já atingiram o limite.`;
      setBulkMarkerMessage(message);
      throw new Error(message);
    }

    setBulkMarkerBusy(true);
    setBulkMarkerMessage("");
    let succeeded = 0;
    try {
      for (const process of selected) {
        await addProcessMarkerWithColor(
          process.id,
          actualLabel,
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


  const personalMarkerOptions = presets.filter(preset => preset.active).map(preset => ({
    label: formatMarkerLabel(preset),
    color: preset.color || "#2563eb",
    emoji: preset.emoji,
  }));
  const availableAnalysts = sessionUsers.filter(user =>
    user.accountStatus === "active" &&
    user.role === "analista" &&
    matchesOperationalScope(effectiveScopeId, user)
  ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const submitBatchAction = async (payload: ProcessBatchPayload) => {
    const action = activeBatchAction;
    if (!action || action === "decisao") throw new Error("Selecione uma operação válida.");
    if (!mayOperate || !remoteSyncedForCurrentUser || bulkMarkerBusy) {
      throw new Error("O perfil ou a unidade não possuem autorização operacional sincronizada.");
    }
    const allowedIds = new Set(municipalityProcesses.map(item => item.id));
    if (batchSelected.length === 0 || batchSelected.length > 25 ||
        batchSelected.some(item => !allowedIds.has(item.id))) {
      throw new Error("Seleção fora do município ou acima de 25 processos.");
    }
    // Only formal assignment/dispatch changes require the current unit to
    // own the process. Personal markers/operational priority do not.
    if ((action === "atribuir" || action === "encaminhar") &&
        batchSelected.some(item => !isProcessOwnedBySessionDepartment(session, item))) {
      throw new Error("A atribuição ou o encaminhamento exige que todos os processos pertençam à unidade responsável. Utilize a unidade correta.");
    }

    if (action === "atribuir") {
      if (session.role !== "prefeitura_supervisor") {
        throw new Error("Somente o gestor da unidade de análise pode distribuir a análise técnica.");
      }
      if (!availableAnalysts.some(user => user.id === payload.analystProfileId)) {
        throw new Error("Selecione um analista ativo da sua prefeitura.");
      }
      if (batchSelected.some(p => p.status === "arquivado" || p.status === "deferido" ||
        p.status === "indeferido")) {
        throw new Error("Processos finalizados não podem ser redistribuídos por esta operação.");
      }
    }

    if (action === "encaminhar") {
      if (!municipalDepartments.some(d => d.isActive && d.name === payload.destination)) {
        throw new Error("Selecione uma unidade ativa do organograma municipal.");
      }
      if (!payload.subject || payload.subject.trim().length < 8 || !payload.dueDate) {
        throw new Error("Informe um assunto válido e um prazo para o despacho.");
      }
      if (batchSelected.some(p => p.processControl?.currentFolder === payload.destination)) {
        throw new Error("O destino precisa ser diferente da unidade de origem.");
      }
    }

    const marker =
      action === "prioridade" ? {
        label: "Prioridade operacional",
        color: payload.priority === "critica" ? "#dc2626" : payload.priority === "alta"
          ? "#ca8a04" : "#2563eb",
        emoji: "",
      } : payload.marker;
    const markerLabel = marker ? composeProfessionalMarkerLabel(marker.label, marker.emoji) : "";
    if ((action === "prioridade" || (action === "etiquetas" && payload.markerOperation !== "remove"))
        && (!marker || batchSelected.some(p =>
          !canApplyPersonalProcessMarker(p.tags ?? [], markerLabel)))) {
      throw new Error(PERSONAL_PROCESS_MARKER_LIMIT_ERROR);
    }
    if (action === "etiquetas" && !marker) throw new Error("Escolha um marcador.");

    let succeeded = 0;
    try {
      for (const process of batchSelected) {
        if (action === "prioridade") {
          await addProcessMarkerWithColor(process.id, markerLabel, marker!.color, session.name);
        } else if (action === "etiquetas") {
          if (payload.markerOperation === "remove") {
            const exists = (process.tags ?? []).some(tag =>
              parseMarker(tag).label.trim().toLocaleLowerCase("pt-BR") ===
              markerLabel.toLocaleLowerCase("pt-BR")
            );
            if (!exists) throw new Error("Marcador não presente em " + process.protocol + ".");
            await removeProcessMarker(process.id, markerLabel, session.name);
          } else {
            await addProcessMarkerWithColor(process.id, markerLabel, marker!.color, session.name);
          }
        } else if (action === "atribuir") {
          const alreadyAssigned = Boolean(process.analysis?.assignedTo || process.analysis?.assignedProfileId);
          if (alreadyAssigned) {
            if (!payload.reason || payload.reason.trim().length < 8) {
              throw new Error("Redistribuição exige justificativa de pelo menos oito caracteres.");
            }
            await reassignProcessAnalysis({ processId: process.id,
              targetProfileId: payload.analystProfileId!, reason: payload.reason });
          } else {
            await assignProcessAnalysis({
              processId: process.id, targetProfileId: payload.analystProfileId!,
            });
          }
        } else if (action === "encaminhar") {
          const origin = process.processControl?.currentFolder ||
            process.dispatches?.[0]?.to || session.department || "";
          if (!origin.trim()) throw new Error("Origem oficial não identificada: " + process.protocol);
          await dispatchProcess({
            processId: process.id, actor: session.name, from: origin,
            to: payload.destination!, subject: payload.subject!,
            dueDate: payload.dueDate!, priority: payload.dispatchPriority || "media",
            visibility: "interno",
          });
        }
        succeeded += 1;
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "Erro de gravação.";
      throw new Error(`${succeeded} de ${batchSelected.length} processo(s) confirmados. ${detail} Confira o histórico antes de repetir para evitar duplicidade.`);
    }
    setBatchActionFeedback(`Operação ${action} confirmada em ${succeeded} processo(s) autorizado(s).`);
    // After an official dispatch, offer SEI-style local closure as a distinct,
    // explicitly confirmed act. Never close the municipality process.
    if (action === "encaminhar" && unitSyncState === "ready") {
      setPendingUnitAction({ processes: [...batchSelected], completed: true });
      setBatchActionFeedback(
        `Encaminhamento confirmado em ${succeeded} processo(s). Confirme, se desejar, a conclusão apenas da unidade de origem.`
      );
    }
    setSelectedProcessIds([]);
  };

  const createPersonalMarker = async (
    marker: CreatedPersonalMarker, applyToSelection: boolean,
  ) => {
    if (!mayOperate) throw new Error("Somente profissionais internos podem criar marcadores.");
    if (presets.some(preset => preset.label.trim().toLocaleLowerCase("pt-BR") ===
        marker.label.trim().toLocaleLowerCase("pt-BR"))) {
      throw new Error("Já existe um marcador com esse nome.");
    }
    const selected = visibleProcesses.filter(process => selectedProcessIds.includes(process.id));
    const markerOption = { label: marker.label, color: marker.color, emoji: marker.emoji };
    if (applyToSelection && selected.length > 0) {
      // Preflight before the preset is created so a blocked fourth marker
      // never appears to have been applied.
      const label = composeProfessionalMarkerLabel(marker.label, marker.emoji);
      if (selected.some(process =>
          !canApplyPersonalProcessMarker(process.tags ?? [], label))) {
        throw new Error("Seleção fora da unidade ou com limite de três marcadores atingido.");
      }
    }
    addPreset({
      label: marker.label, colorId: marker.colorId, color: marker.color,
      emoji: marker.emoji, active: true,
    });
    if (applyToSelection && selected.length > 0) {
      try {
        await applyMarkerToSelected(selected, markerOption);
      } catch {
        setBulkMarkerMessage("Modelo criado na sua pasta, mas a aplicação não foi integralmente confirmada. Confira as marcações dos processos.");
        // The preset really exists; close the creation dialog normally and
        // surface partial application in the operational feedback instead.
        return;
      }
    }
  };

  const queueUnitCompletion = (selected: ProcessRecord[], completed: boolean) => {
    if (!mayOperate) {
      setUnitError("A conclusão local exige perfil operacional interno. O administrador municipal somente consulta.");
      return;
    }
    if (unitSyncState !== "ready" || unitActionBusy || !remoteSyncedForCurrentUser) {
      setUnitError("Concluir nesta unidade ainda não está disponível no banco oficial. A operação foi bloqueada para não alterar a situação geral indevidamente.");
      return;
    }
    const municipalIds = new Set(municipalityProcesses.map(process => process.id));
    if (!selected.length || selected.length > 25 || selected.some(process => !municipalIds.has(process.id))) {
      setUnitError("Selecione até 25 processos oficiais deste município.");
      return;
    }
    if (selected.some(process => completed
      ? (!canCompleteInMyUnit(process) ||
        unitCompletions[process.id]?.status === "concluido")
      : unitCompletions[process.id]?.status !== "concluido")) {
      setUnitError("Selecione somente processos da sua unidade no mesmo estado.");
      return;
    }
    setUnitError("");
    setPendingUnitAction({ processes: selected, completed });
  };

  const confirmUnitCompletion = async () => {
    if (!pendingUnitAction || unitActionBusy || unitSyncState !== "ready") return;
    const action = pendingUnitAction;
    setUnitActionBusy(true);
    setUnitError("");
    setUnitFeedback("");
    let succeeded = 0;
    try {
      for (const process of action.processes) {
        const saved = await setMyUnitProcessCompletion(process.id, action.completed);
        setUnitCompletions(current => ({ ...current, [process.id]: saved }));
        succeeded += 1;
      }
      setSelectedProcessIds([]);
      setPendingUnitAction(null);
      // SEI-like behavior: concluding removes it from the active unit queue,
      // but keeps the record searchable in the municipal overview.
      setUnitView(action.completed ? "abertos" : "todos");
      setUnitFeedback(`${succeeded} processo(s) ${action.completed ? "concluído(s)" : "reaberto(s)"} apenas nesta unidade. O status municipal não foi alterado.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erro no banco.";
      setUnitError(`${succeeded} de ${action.processes.length} confirmados. ${reason} Confira os registros antes de repetir.`);
      setPendingUnitAction(null);
    } finally {
      setUnitActionBusy(false);
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

        {!mayOperate && selectedVisibleIds.length > 0 ? (
          <p role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Perfil atual em modo consulta: somente os servidores autorizados podem aplicar marcadores,
            distribuir análises, encaminhar e concluir atendimentos. Para operar, acesse
            com o perfil interno competente da unidade.
          </p>
        ) : null}
        {mayOperate ? (
          <div data-sigapro-unit-workspace="true"
            className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
            <span className="min-w-0 font-semibold text-slate-700 dark:text-slate-200">
              Unidade: {unitName}
            </span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Visualização dos processos da unidade">
              {([
                ["todos", "Todos no município"],
                ["abertos", "Em andamento nesta unidade"],
                ["concluidos", "Concluídos nesta unidade"],
              ] as const).map(([value, label]) => (
                <Button key={value} type="button" size="sm"
                  variant={unitView === value ? "default" : "outline"}
                  disabled={value !== "todos" && unitSyncState !== "ready"}
                  aria-pressed={unitView === value}
                  onClick={() => { setSelectedProcessIds([]); setUnitView(value); }}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {unitError ? (
          <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Conclusão da unidade indisponível: {unitError}
          </div>
        ) : null}
        {unitFeedback ? (
          <p role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
            {unitFeedback}
          </p>
        ) : null}

        <CompactProcessRegistry
          operatorName={session.name} operator={session}
          processes={visibleProcesses}
          exportScopeLabel={municipality?.name || "Processos oficiais da Prefeitura"}
          onToolbarAction={(action, selected) => {
            setBatchActionFeedback("");
            setBatchSelected(selected);
            setActiveBatchAction(action);
          }}
          onCreateMarker={mayOperate ? () => setCreateMarkerOpen(true) : undefined}
          unitCompletedIds={Object.values(unitCompletions).filter(row => row.status === "concluido").map(row => row.process_id)}
          unitDataReady={mayOperate && unitSyncState === "ready" && !unitActionBusy}
          onUnitAction={queueUnitCompletion}
          canCompleteInUnit={canCompleteInMyUnit}
          markerOptions={personalMarkerOptions}
          onBulkMarker={mayOperate ? applyMarkerToSelected : undefined}
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

        <ProcessBatchActionDialog
          action={activeBatchAction}
          selected={batchSelected}
          canOperate={mayOperate &&
            (activeBatchAction !== "atribuir" || session.role === "prefeitura_supervisor") &&
            (activeBatchAction === "prioridade" || activeBatchAction === "etiquetas" ||
              activeBatchAction === "decisao" ||
              batchSelected.every(item => isProcessOwnedBySessionDepartment(session, item))
            )}
          analysts={availableAnalysts}
          departments={municipalDepartments}
          markers={personalMarkerOptions}
          onClose={() => { setActiveBatchAction(null); setBatchSelected([]); }}
          onCreateMarker={() => setCreateMarkerOpen(true)}
          onSubmit={submitBatchAction}
        />
        {batchActionFeedback ? (
          <p role="status" className="my-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
            {batchActionFeedback}
          </p>
        ) : null}
        <CreateProcessMarkerDialog open={createMarkerOpen}
          onOpenChange={setCreateMarkerOpen}
          selectedCount={selectedVisibleIds.length}
          existingNames={presets.map(preset => preset.label)}
          onCreate={createPersonalMarker} />
        <Dialog open={Boolean(pendingUnitAction)}
          onOpenChange={open => { if (!open && !unitActionBusy) setPendingUnitAction(null); }}>
          <DialogContent className="max-w-[490px] border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-white">
            <DialogHeader>
              <DialogTitle>
                {pendingUnitAction?.completed ? "Concluir nesta unidade" : "Reabrir nesta unidade"}
              </DialogTitle>
              <DialogDescription>
                {pendingUnitAction?.processes.length ?? 0} processo(s) selecionado(s) — {unitName}.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm leading-6">
              Esta ação registra somente o atendimento da sua unidade. Não encerra o processo municipal,
              não altera a situação geral e não interfere nas demais unidades, guias ou alvarás.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={unitActionBusy}
                onClick={() => setPendingUnitAction(null)}>Cancelar</Button>
              <Button type="button" disabled={unitActionBusy} onClick={() => { void confirmUnitCompletion(); }}>
                {pendingUnitAction?.completed ? <CheckCircle2 className="mr-2 h-4 w-4" /> :
                  <RotateCcw className="mr-2 h-4 w-4" />}
                {unitActionBusy ? "Registrando..." :
                  pendingUnitAction?.completed ? "Confirmar conclusão na unidade" : "Confirmar reabertura"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
