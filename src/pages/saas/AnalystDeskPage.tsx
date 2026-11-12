import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  FileText,
  ListTodo,
  Search,
  Send,
  Stamp,
  TimerReset,
  UserCheck,
  UserPlus,
  Users2,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCard } from "@/components/platform/AlertCard";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { MarkerSelector } from "@/components/platform/MarkerSelector";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { QaArchitecturalLab } from "@/components/platform/QaArchitecturalLab";
import { SectionCard } from "@/components/platform/SectionCard";
import { TableCard } from "@/components/platform/TableCard";
import {
  PageMainContent,
  PageMainGrid,
  PageShell,
  PageSideContent,
  PageStatsRow,
} from "@/components/platform/PageShell";
import { StatCard } from "@/components/platform/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildProcessPath,
  canAnalyzeProcessDocument,
  canAccessMunicipalArea,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getChecklistTemplate,
  getProcessPaymentGuides,
  matchesOperationalScope,
  parseMarker,
  statusLabel,
  statusTone,
  type ProcessRecord,
  URBAN_ANALYSIS_DEPARTMENT,
} from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { buildAnalysisRegistry } from "@/lib/analysisRegistry";
import { paginateRegistry } from "@/lib/analysisRegistryPagination";
import {
  buildAnalysisQueueExportRows,
  createAnalysisQueuePdf,
  downloadAnalysisQueueCsv,
  downloadAnalysisQueuePdf,
} from "@/lib/analysisQueueReport";
import { resolveProcessDispatchAuthor } from "@/lib/dispatchActorIdentity";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { backendClient } from "@/integrations/backend/databaseClient";
import "@/styles/analysis-workspace.css";

type AnalystSection =
  | "visao-geral"
  | "fila"
  | "concluidos"
  | "pendencias"
  | "correcoes"
  | "historico"
  | "indicadores";

function getPriorityBadge(process: { sla: { breached: boolean; hoursRemaining: number } }) {
  if (process.sla.breached) return "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400";
  if (process.sla.hoursRemaining <= 12) return "border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getPriorityLabel(process: { sla: { breached: boolean; hoursRemaining: number } }) {
  if (process.sla.breached) return "SLA vencido";
  if (process.sla.hoursRemaining <= 12) return "Prioridade alta";
  return "Fila regular";
}

function getOpenRequirements(process: ProcessRecord) {
  return process.requirements.filter(
    (item) => item.status === "aberta" || item.status === "respondida",
  );
}

function isoDateAfterDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function AnalystDeskPage() {
  const navigate = useNavigate();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const {
    processes: allProcesses,
    sessionUsers,
    remoteSyncedForCurrentUser,
    dataError: platformDataError,
    loading: platformDataLoading,
    refreshRemoteStore,
    updateProcessStatus,
    startProcessAnalysis,
    assignProcessAnalysis,
    dispatchProcess,
    createRequirement,
    documentTemplates,
    getInstitutionSettings,
  } = usePlatformData();
  const effectiveScopeId =
    session.municipalityId ??
    session.tenantId ??
    municipality?.id ??
    scopeId ??
    null;
  const tenantSettings = getInstitutionSettings(effectiveScopeId ?? session.tenantId);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<AnalystSection>(() => {
    const requested = searchParams.get("secao");
    return requested && ["visao-geral", "fila", "concluidos", "pendencias", "correcoes", "historico", "indicadores"].includes(requested)
      ? requested as AnalystSection
      : "fila";
  });
  const [actionBusy, setActionBusy] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({});
  const [dispatchFor, setDispatchFor] = useState<string | null>(null);
  const [dispatchDestination, setDispatchDestination] = useState("Diretoria de Urbanismo");
  const [dispatchNote, setDispatchNote] = useState("");
  const [dispatchTargetAnalystId, setDispatchTargetAnalystId] = useState("");
  const currentUnit =
    session.role === "analista"
      ? session.department || session.title || URBAN_ANALYSIS_DEPARTMENT
      : URBAN_ANALYSIS_DEPARTMENT;

  // Somente processos oficialmente liberados entram na fila operacional.
  // A existência de atribuição antiga não supre pagamento ou triagem.
  const { departmentProcesses, registry: analysisRegistryBase } = buildAnalysisRegistry(
    session, effectiveScopeId, allProcesses, remoteSyncedForCurrentUser,
  );

  const refreshRemoteStoreRef = useRef(refreshRemoteStore);

  useEffect(() => {
    refreshRemoteStoreRef.current = refreshRemoteStore;
  }, [refreshRemoteStore]);

  const refreshAnalysisDesk = useCallback(async () => {
    if (!effectiveScopeId) return;
    try {
      await refreshRemoteStoreRef.current();
    } catch (error) {
      console.warn("[SIGAPRO][Analise] Atualizacao automatica indisponivel", error);
    }
  }, [effectiveScopeId]);

  useEffect(() => {
    let disposed = false;
    const sync = () => {
      if (disposed || document.visibilityState !== "visible") return;
      void refreshAnalysisDesk();
    };

    // Initial data is loaded by PlatformDataProvider. A second full load on
    // mount caused duplicate requests; data-change/focus still refresh now.
    const timer = window.setInterval(sync, 30000);
    window.addEventListener("focus", sync);
    window.addEventListener("sigapro:data-changed", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("sigapro:data-changed", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [refreshAnalysisDesk]);

  // A fila operacional continua restrita ao setor atual, mas o registro da Análise
  // mantém os processos que já passaram pela mesa técnica, mesmo depois do envio
  // ao Financeiro ou a outra unidade.
  const filterBySearch = (item: ProcessRecord) => {
    const haystack = `${formatOfficialProcessNumber(item.protocol)} ${item.externalProtocol} ${item.title} ${item.ownerName} ${item.property.iptu} ${item.address} ${item.analysis?.assignedTo || ""} ${item.processControl?.currentFolder || ""}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  };

  const activeProcesses = departmentProcesses.filter(filterBySearch);
  const processes = analysisRegistryBase.filter(filterBySearch);

  const archiveStorageKey = `sigapro:analysis-archive:${session.id}:${effectiveScopeId || "default"}`;
  const [archivedProcessIds, setArchivedProcessIds] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [registryPage, setRegistryPage] = useState(1);

  useEffect(() => {
    setRegistryPage(1);
  }, [search, showArchived, effectiveScopeId]);
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const hydratePersonalArchive = async () => {
      let cached: string[] = [];
      try {
        const stored = window.localStorage.getItem(archiveStorageKey);
        const parsed = stored ? JSON.parse(stored) : [];
        cached = Array.isArray(parsed)
          ? parsed.filter((value) => typeof value === "string")
          : [];
        if (!disposed) setArchivedProcessIds(cached);
      } catch {
        cached = [];
      }

      const { data, error } = await backendClient
        .from("profile_process_archives")
        .select("process_id")
        .eq("profile_id", session.id);

      if (disposed || error) return;

      const official: string[] = Array.from(
        new Set<string>(
          (data ?? [])
            .map((row) => String(row.process_id || ""))
            .filter(Boolean),
        ),
      );

      setArchivedProcessIds(official);
      try {
        window.localStorage.setItem(archiveStorageKey, JSON.stringify(official));
      } catch {
        // O banco permanece como fonte oficial mesmo quando o cache local está indisponível.
      }
    };

    void hydratePersonalArchive();
    return () => {
      disposed = true;
    };
  }, [archiveStorageKey, session.id]);

  useEffect(() => {
    const requested = searchParams.get("secao");
    if (requested === "fila") {
      setSection("fila");
    }
  }, [searchParams]);

  const setProcessArchived = async (processId: string, archived: boolean) => {
    const previous = archivedProcessIds;
    const next = archived
      ? Array.from(new Set([...previous, processId]))
      : previous.filter((id) => id !== processId);

    setArchivedProcessIds(next);
    try {
      window.localStorage.setItem(archiveStorageKey, JSON.stringify(next));
    } catch {
      // Cache local opcional.
    }

    const result = archived
      ? await backendClient
          .from("profile_process_archives")
          .upsert(
            { profile_id: session.id, process_id: processId },
            { onConflict: "profile_id,process_id" },
          )
      : await backendClient
          .from("profile_process_archives")
          .delete()
          .eq("profile_id", session.id)
          .eq("process_id", processId);

    if (result.error) {
      setArchivedProcessIds(previous);
      try {
        window.localStorage.setItem(archiveStorageKey, JSON.stringify(previous));
      } catch {
        // Cache local opcional.
      }
      setActionStatus(
        archived
          ? "Não foi possível arquivar este processo somente para o seu perfil."
          : "Não foi possível restaurar este processo na sua lista.",
      );
      return;
    }

    setActionStatus(
      archived
        ? "Processo arquivado somente na sua visualização. Ele continua disponível para os demais perfis e no registro geral."
        : "Processo restaurado na sua visualização.",
    );
  };

  const requirementsOpen = activeProcesses.reduce(
    (count, process) => count + getOpenRequirements(process).length,
    0,
  );
  const slaCritical = activeProcesses.filter((item) => item.sla.breached || item.sla.hoursRemaining <= 12);
  const analysisActiveStatuses = [
    "distribuicao",
    "analise_tecnica",
    "pendencia_documental",
    "exigencia",
    "reapresentacao",
    "despacho_intersetorial",
  ] as const;
  const inReview = activeProcesses.filter((item) => item.status === "analise_tecnica");
  const completed = processes.filter((item) => ["deferido", "arquivado"].includes(item.status));
  // Personal archive markers cannot erase official completed-process totals.
  const visibleCompleted = completed;
  const correctionQueue = activeProcesses.filter(
    (item) => item.status === "reapresentacao" || item.status === "exigencia",
  );
  const blockedItems = activeProcesses.filter(
    (item) => item.status === "pendencia_documental" || item.status === "exigencia",
  );
  const analysisWorkItems = activeProcesses.filter((item) =>
    analysisActiveStatuses.includes(item.status as (typeof analysisActiveStatuses)[number]),
  );
  const analysisTrackedProcesses = processes.filter(
    (item) => Boolean(item.analysis?.startedAt || item.analysis?.assignedTo || item.analysis?.assignedProfileId),
  );
  const analysisRegistryProcesses = processes.filter(
    (item) =>
      analysisActiveStatuses.includes(item.status as (typeof analysisActiveStatuses)[number]) ||
      Boolean(item.analysis?.startedAt || item.analysis?.assignedTo || item.analysis?.assignedProfileId),
  );
  const processRegistry = [...analysisRegistryProcesses]
    // Default is the full municipal record. Personal archived markers may
    // highlight rows or constrain the explicit Archives view, never hide real
    // official processes on the main screen.
    .filter((item) => !showArchived || archivedProcessIds.includes(item.id))
    .sort((a, b) => {
      const aActive = analysisActiveStatuses.includes(a.status as (typeof analysisActiveStatuses)[number]) ? 1 : 0;
      const bActive = analysisActiveStatuses.includes(b.status as (typeof analysisActiveStatuses)[number]) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aDate = Date.parse(a.analysis?.startedAt || a.timeline[0]?.at || "1970-01-01");
      const bDate = Date.parse(b.analysis?.startedAt || b.timeline[0]?.at || "1970-01-01");
      return bDate - aDate;
    });
  const registryPagination = paginateRegistry(processRegistry, registryPage, 15);
  const handedOffFromAnalysis = analysisTrackedProcesses.filter(
    (item) =>
      !analysisActiveStatuses.includes(item.status as (typeof analysisActiveStatuses)[number]) &&
      item.status !== "deferido",
  );

  const queue = useMemo(
    () =>
      [...analysisWorkItems].sort((a, b) => {
        const aPriority = a.sla.breached ? 2 : a.sla.hoursRemaining <= 12 ? 1 : 0;
        const bPriority = b.sla.breached ? 2 : b.sla.hoursRemaining <= 12 ? 1 : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return a.sla.hoursRemaining - b.sla.hoursRemaining;
      }),
    [analysisWorkItems],
  );

  const unassignedAnalysis = queue.filter(
    (process) => !process.analysis?.assignedProfileId && !process.analysis?.assignedTo,
  );
  const myAnalyses = queue.filter(
    (process) =>
      process.analysis?.assignedProfileId === session.id ||
      (!process.analysis?.assignedProfileId && process.analysis?.assignedTo === session.name),
  );
  const teamAssignedAnalysis = queue.filter(
    (process) =>
      Boolean(process.analysis?.assignedProfileId || process.analysis?.assignedTo) &&
      !myAnalyses.some((mine) => mine.id === process.id),
  );

  const resolveAssignedAnalystName = useCallback(
    (process: ProcessRecord) => {
      const profileId = process.analysis?.assignedProfileId;
      if (profileId) {
        const profile = sessionUsers.find((user) => user.id === profileId);
        if (profile?.name) return profile.name;
      }
      return process.analysis?.assignedTo || "Sem responsável";
    },
    [sessionUsers],
  );

  const analysisTeam = useMemo(
    () =>
      sessionUsers
        .filter(
          (user) =>
            user.accountStatus === "active" &&
            user.role === "analista" &&
            matchesOperationalScope(effectiveScopeId, user),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [effectiveScopeId, sessionUsers],
  );

  const analysisTeamLoad = useMemo(
    () =>
      analysisTeam
        .map((analyst) => ({
          analyst,
          active: queue.filter(
            (process) =>
              process.analysis?.assignedProfileId === analyst.id ||
              (!process.analysis?.assignedProfileId && process.analysis?.assignedTo === analyst.name),
          ).length,
        }))
        .sort((a, b) => a.active - b.active || a.analyst.name.localeCompare(b.analyst.name, "pt-BR")),
    [analysisTeam, queue],
  );

  const urgentProtocols = queue.slice(0, 5);
  const recentDecisions = completed.slice(0, 5);
  const latestAssigned = analysisTrackedProcesses
    .filter((process) => process.analysis?.assignedTo === session.name)
    .slice(0, 5);
  const recentActivity = analysisTrackedProcesses
    .flatMap((process) =>
      process.timeline.map((entry) => ({
        id: `${process.id}-${entry.id}`,
        processId: process.id,
        protocol: process.protocol,
        title: entry.title,
        detail: entry.detail,
        actor: entry.actor,
        at: entry.at,
        status: process.status,
      })),
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 16);

  const productivityByAnalyst = useMemo(() => {
    const map = new Map<string, { analyst: string; total: number; deferidos: number; exigencias: number }>();
    analysisTrackedProcesses.forEach((process) => {
      const key = process.analysis?.assignedTo || "Não atribuído";
      const current = map.get(key) ?? { analyst: key, total: 0, deferidos: 0, exigencias: 0 };
      current.total += 1;
      if (process.status === "deferido") current.deferidos += 1;
      if (getOpenRequirements(process).length > 0) current.exigencias += 1;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [analysisTrackedProcesses]);

  const averageSlaHours =
    activeProcesses.length > 0
      ? Math.round(activeProcesses.reduce((total, item) => total + item.sla.hoursRemaining, 0) / activeProcesses.length)
      : 0;

  const dispatchTemplate = documentTemplates.find((item) => item.type === "despacho");
  const dispatchRows = useMemo(
    () =>
      activeProcesses.flatMap((process) =>
        process.dispatches.map((dispatch) => ({
          id: `${process.id}-${dispatch.id}`,
          processId: process.id,
          protocol: process.protocol,
          title: process.title,
          from: dispatch.from,
          to: dispatch.to,
          subject: dispatch.subject,
          dueDate: dispatch.dueDate,
          dispatchStatus: dispatch.status,
          priority: dispatch.priority ?? "media",
          assignedTo: dispatch.assignedTo || "",
          currentFolder: process.processControl?.currentFolder || dispatch.to || process.sla.currentStage,
        })),
      ),
    [activeProcesses],
  );
  const dispatchesForCurrentUnit = useMemo(
    () =>
      dispatchRows.filter(
        (item) =>
          item.to.toLowerCase().includes(currentUnit.toLowerCase()) ||
          item.currentFolder.toLowerCase().includes(currentUnit.toLowerCase()),
      ),
    [currentUnit, dispatchRows],
  );
  const assignedToMe = useMemo(
    () => dispatchRows.filter((item) => item.assignedTo === session.name).slice(0, 6),
    [dispatchRows, session.name],
  );
  const restrictedDispatches = useMemo(
    () => processes.filter((process) => (process.processControl?.externalTransitView ?? "completo") === "restrito").length,
    [processes],
  );
  const criticalDispatches = useMemo(
    () =>
      dispatchRows.filter(
        (item) => item.priority === "critica" || item.priority === "alta" || item.dispatchStatus === "aguardando",
      ).slice(0, 5),
    [dispatchRows],
  );

  const runAnalystAction = async (
    key: string,
    successMessage: string,
    action: () => Promise<void>,
  ) => {
    if (actionBusy) return false;
    setActionBusy(key);
    setActionStatus("");
    try {
      await action();
      setActionStatus(successMessage);
      return true;
    } catch (error) {
      setActionStatus(
        error instanceof Error
          ? `Não foi possível concluir a operação: ${error.message}`
          : "Não foi possível concluir a operação no banco oficial.",
      );
      return false;
    } finally {
      setActionBusy("");
    }
  };

  const saveTechnicalDispatch = async (process: ProcessRecord) => {
    if (!dispatchNote.trim()) {
      setActionStatus("Informe o texto do despacho.");
      return;
    }
    const selectedAnalyst = dispatchDestination === "Análise Urbanística"
      ? analysisTeam.find((analyst) => analyst.id === dispatchTargetAnalystId)
      : undefined;
    if (dispatchDestination === "Análise Urbanística" && !selectedAnalyst) {
      setActionStatus("Selecione o analista que receberá o encaminhamento.");
      return;
    }
    const ok = await runAnalystAction(
      `dispatch-${process.id}`,
      "Despacho registrado no processo.",
      () => dispatchProcess({
        processId: process.id,
        actor: session.name,
        from: "Análise Urbanística",
        to: dispatchDestination,
        subject: dispatchNote.trim(),
        assignedTo: selectedAnalyst?.name,
        dueDate: isoDateAfterDays(3),
        visibility: "interno",
      }),
    );
    if (ok) {
      setDispatchFor(null);
      setDispatchNote("");
    }
  };

  const handleAssignAnalysis = async (process: ProcessRecord) => {
    const suggestedProfileId = analysisTeamLoad[0]?.analyst.id || "";
    const targetProfileId = assignmentTargets[process.id] || suggestedProfileId;
    if (!targetProfileId) {
      setActionStatus("Nenhum analista ativo está disponível para receber este processo.");
      return;
    }

    const analyst = analysisTeam.find((item) => item.id === targetProfileId);
    const ok = await runAnalystAction(
      `assign-${process.id}`,
      `Processo distribuído para ${analyst?.name || "o analista selecionado"}. A atribuição organiza carga e SLA; a equipe da Análise continua podendo colaborar tecnicamente no processo.`,
      () => assignProcessAnalysis({ processId: process.id, targetProfileId }),
    );

    if (ok) {
      setAssignmentTargets((current) => {
        const next = { ...current };
        delete next[process.id];
        return next;
      });
    }
  };

  const handleStartAnalysis = async (process: ProcessRecord) => {
    if (
      session.role === "prefeitura_supervisor" &&
      canAccessMunicipalArea(session, "analise")
    ) {
      navigate(buildProcessPath(process, "analise"));
      return;
    }

    const assignedProfileId = String(process.analysis?.assignedProfileId || "").trim();
    const assignedName = String(process.analysis?.assignedTo || "").trim();
    const assignedToAnotherAnalyst =
      (assignedProfileId && assignedProfileId !== session.id) ||
      (!assignedProfileId && assignedName && assignedName !== session.name);

    if (process.analysis?.startedAt || assignedToAnotherAnalyst) {
      navigate(buildProcessPath(process, "analise"));
      return;
    }

    const ok = await runAnalystAction(
      `start-${process.id}`,
      "Análise Urbanística iniciada. O processo foi atribuído ao analista e aberto na mesa de trabalho.",
      () => startProcessAnalysis(process.id),
    );

    if (ok) {
      navigate(buildProcessPath(process, "analise"));
    }
  };

  const navItems = [
    { value: "visao-geral", label: "Resumo", helper: "Prioridades da mesa técnica" },
    { value: "fila", label: "Processos da análise", helper: "Ativos, encaminhados e concluídos" },
    { value: "concluidos", label: "Concluídos", helper: `${visibleCompleted.length} processo(s) finalizado(s)` },
    { value: "pendencias", label: "Pendências", helper: "Bloqueios e inconsistências" },
    { value: "correcoes", label: "Correções solicitadas", helper: "Retornos e reapresentação" },
    { value: "historico", label: "Histórico técnico", helper: "Comentários, decisões e movimentos" },
    { value: "indicadores", label: "Indicadores e SLA", helper: "Carga, prazo e produtividade" },
  ] as const;

  const renderQueue = (
    items = queue,
    emptyMessage = "Nenhum processo encontrado com os filtros atuais.",
    allowArchiveAction = false,
  ) => (
    <div className="space-y-3.5">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
          {remoteSyncedForCurrentUser
            ? emptyMessage
            : platformDataError
              ? "Não foi possível confirmar os processos no banco oficial. Confira o aviso de sincronização acima."
              : "Aguardando a conferência dos processos no banco oficial..."}
        </div>
      ) : (
        items.map((process) => {
          const pendingRequirements = getOpenRequirements(process);
          const checklist = getChecklistTemplate(process.checklistType, process.tenantId);
          const requiredDocuments = process.documents.filter((document) => document.required);
          const uploadedRequiredDocuments = requiredDocuments.filter((document) => document.uploaded);
          const missingRequiredDocuments = requiredDocuments.length - uploadedRequiredDocuments.length;
          const processGuides = getProcessPaymentGuides(process, tenantSettings);
          const issGuide = processGuides.find((guide) => guide.kind === "iss_obra");
          const issStageEnabled = tenantSettings?.issStageEnabled !== false;
          const issSatisfied = !issStageEnabled || issGuide?.status === "compensada";
          const finalFeeEnabled = tenantSettings?.finalApprovalFeeEnabled !== false;
          const analysisStarted = Boolean(process.analysis?.startedAt);
          const currentAnalyst = resolveAssignedAnalystName(process);
          const hasAssignedAnalyst = Boolean(
            process.analysis?.assignedProfileId || process.analysis?.assignedTo,
          );
          const assignedToCurrentSession =
            process.analysis?.assignedProfileId === session.id ||
            (!process.analysis?.assignedProfileId && process.analysis?.assignedTo === session.name);
          const canEditAnalysis = canAnalyzeProcessDocument(session, process, effectiveScopeId);
          const isSupervisorView =
            session.role === "prefeitura_supervisor" &&
            canAccessMunicipalArea(session, "analise");
          const isExpanded = expandedProcessId === process.id;

          return (
            <div
              key={process.id}
              data-process-premium-card="true"
              data-surface="adaptive-card"
              data-expanded={isExpanded ? "true" : "false"}
              className={`relative overflow-hidden rounded-[22px] border bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] transition-[border-color,box-shadow,transform] duration-200 dark:bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] ${
                isExpanded
                  ? "border-sky-300 shadow-[0_18px_42px_rgba(7,89,133,0.12)]"
                  : "border-slate-200 shadow-[0_8px_24px_rgba(15,23,42,0.055)] hover:-translate-y-px hover:border-sky-200 hover:shadow-[0_16px_36px_rgba(15,23,42,0.09)] dark:border-slate-700"
              }`}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("a,button,input,select,textarea,[role='button']")) return;
                setExpandedProcessId((current) => (current === process.id ? null : process.id));
              }}
            >
              <div
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-1 ${
                  isExpanded
                    ? "bg-sky-600"
                    : process.sla.breached
                      ? "bg-rose-500"
                      : process.sla.hoursRemaining <= 12
                        ? "bg-amber-500"
                        : "bg-slate-300 dark:bg-slate-600"
                }`}
              />
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <div className="min-w-[min(100%,280px)] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={buildProcessPath(process, "analise")}
                      className="sig-fit-title inline-flex text-[15px] font-extrabold leading-6 tracking-[-0.01em] text-[#075985] underline decoration-sky-300/70 underline-offset-[3px] hover:text-[#0369a1] hover:decoration-sky-600 dark:text-sky-300"
                      title={`Abrir ${formatOfficialProcessNumber(process.protocol)}`}
                    >
                      {formatOfficialProcessNumber(process.protocol)}
                    </Link>
                    <Badge variant="outline" className={statusTone(process.status)}>
                      {statusLabel(process.status)}
                    </Badge>
                    <Badge className={`rounded-full border ${getPriorityBadge(process)}`}>
                      {getPriorityLabel(process)}
                    </Badge>
                    {!hasAssignedAnalyst ? (
                      <Badge variant="outline" className="border-amber-400/35 bg-amber-400/15 text-amber-800 dark:text-amber-200">
                        <UserPlus className="mr-1 h-3.5 w-3.5" />
                        Aguardando analista
                      </Badge>
                    ) : assignedToCurrentSession ? (
                      <Badge variant="outline" className="border-emerald-400/30 bg-emerald-400/15 text-emerald-800 dark:text-emerald-200">
                        <UserCheck className="mr-1 h-3.5 w-3.5" />
                        Minha análise
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">
                        <UserCheck className="mr-1 h-3.5 w-3.5" />
                        {analysisStarted ? "Em análise" : "Distribuído"} · {currentAnalyst}
                      </Badge>
                    )}
                    <MarkerSelector
                      processId={process.id}
                      tags={process.tags}
                      actor={session.name}
                      subjectLabel="processo"
                      triggerClassName="h-9"
                    />
                    {process.triage.status !== "concluido" ? (
                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                        Triagem
                      </Badge>
                    ) : null}
                  </div>

                  <p
                    className="mt-2 line-clamp-1 text-[13px] font-bold tracking-[-0.005em] text-slate-900 dark:text-slate-100"
                    title={formatOfficialProcessTitle({ title: process.title, type: process.type })}
                  >
                    {formatOfficialProcessTitle({ title: process.title, type: process.type })}
                  </p>
                  <p
                    className="sig-fit-copy mt-1 line-clamp-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400"
                    title={`${process.address} • IPTU ${process.property.iptu} • Matrícula ${process.property.registration}`}
                  >
                    {process.address} • IPTU {process.property.iptu} • Matrícula {process.property.registration}
                  </p>
                </div>

                <div data-analysis-process-actions="true" className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                  {session.role === "analista" &&
                    canAccessMunicipalArea(session, "analise") &&
                    !hasAssignedAnalyst && !analysisStarted ? (
                    <Button type="button" data-sigapro-assume-analysis-direct="true"
                      className="min-h-10 max-w-full rounded-xl bg-[#075985] px-4 !text-white hover:bg-[#0c4a6e] [&_*]:!text-white"
                      disabled={Boolean(actionBusy)}
                      onClick={() => void handleStartAnalysis(process)}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      {actionBusy === `start-${process.id}` ? "Iniciando..." : "Assumir análise e abrir editor"}
                    </Button>
                  ) : null}
                  {canEditAnalysis && analysisStarted ? (
                    <Button type="button" variant="outline" size="sm"
                      className="h-10 rounded-xl border-sky-400/25 bg-sky-400/10 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-400/20 dark:text-sky-200"
                      onClick={() => { setDispatchFor((current) => current === process.id ? null : process.id); setDispatchNote(""); }}>
                      <Send className="mr-1.5 h-4 w-4" /> Encaminhar / despachar
                    </Button>
                  ) : null}

                  {allowArchiveAction ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl border-slate-200 bg-white text-slate-600 shadow-[0_4px_12px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      onClick={() =>
                        void setProcessArchived(
                          process.id,
                          !archivedProcessIds.includes(process.id),
                        )
                      }
                      title={
                        archivedProcessIds.includes(process.id)
                          ? "Restaurar na lista"
                          : "Arquivar da minha lista"
                      }
                    >
                      {archivedProcessIds.includes(process.id) ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`h-10 rounded-xl border-slate-200 bg-white px-4 text-[11px] font-bold text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.05)] hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
                      isExpanded ? "border-sky-300 bg-sky-50 text-sky-800" : ""
                    }`}
                    onClick={() =>
                      setExpandedProcessId((current) =>
                        current === process.id ? null : process.id,
                      )
                    }
                    aria-expanded={isExpanded}
                    aria-controls={`analysis-process-details-${process.id}`}
                  >
                    <span>{isExpanded ? "Recolher" : "Ver detalhes"}</span>
                    <ChevronDown
                      className={`ml-1.5 h-4 w-4 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </div>
              </div>

              {dispatchFor === process.id ? (
                <div className="mx-5 mb-4 rounded-xl border border-sky-400/20 bg-[#0c2235] p-4">
                  <p className="text-sm font-bold text-white">Encaminhar / despachar processo</p>
                  <label className="mt-3 block text-xs font-semibold text-slate-200">
                    Setor de destino
                    <Select value={dispatchDestination} onValueChange={setDispatchDestination}>
                      <SelectTrigger className="mt-1 h-11 w-full rounded-xl border border-white/20 !bg-[#081b2b] !text-slate-100 [&>svg]:text-slate-300">
                        <SelectValue placeholder="Selecione um setor" />
                      </SelectTrigger>
                      <SelectContent className="z-[100] border border-slate-600 !bg-[#0b2134] !text-slate-100 shadow-2xl [&_[role=option]]:text-slate-100 [&_[role=option][data-highlighted]]:!bg-sky-700">
                        <SelectItem value="Diretoria de Urbanismo">Diretoria de Urbanismo</SelectItem>
                        <SelectItem value="Análise Urbanística">Outro analista da Análise Urbanística</SelectItem>
                        <SelectItem value="Setor de IPTU / Fiscal">Setor de IPTU / Fiscal</SelectItem>
                        <SelectItem value="Financeiro">Financeiro</SelectItem>
                        <SelectItem value="Protocolo">Protocolo</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  {dispatchDestination === "Análise Urbanística" ? (
                    <label className="mt-3 block text-xs font-semibold text-slate-200">
                      Analista destinatário
                      <Select value={dispatchTargetAnalystId} onValueChange={setDispatchTargetAnalystId}>
                        <SelectTrigger className="mt-1 h-11 w-full rounded-xl border border-white/20 !bg-[#081b2b] !text-slate-100 [&>svg]:text-slate-300">
                          <SelectValue placeholder="Selecione um analista" />
                        </SelectTrigger>
                        <SelectContent className="z-[100] border border-slate-600 !bg-[#0b2134] !text-slate-100 shadow-2xl [&_[role=option]]:text-slate-100 [&_[role=option][data-highlighted]]:!bg-sky-700">
                          {analysisTeam.filter((analyst) => analyst.id !== session.id).map((analyst) => (
                            <SelectItem key={analyst.id} value={analyst.id}>{analyst.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ) : null}
                  <label className="mt-3 block text-xs font-semibold text-slate-200">
                    Texto do despacho
                    <textarea value={dispatchNote} onChange={(event) => setDispatchNote(event.target.value)}
                      maxLength={4000} rows={3} placeholder="Escreva o despacho..."
                      className="mt-1 block w-full rounded-lg border border-white/20 bg-[#081b2b] p-3 text-sm text-white placeholder:text-slate-400" />
                  </label>
                  <p className="mt-2 text-xs text-slate-300">Despachado por: <strong className="text-white">{session.name}</strong></p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDispatchFor(null)}>Cancelar</Button>
                    <Button type="button" disabled={Boolean(actionBusy) || !dispatchNote.trim() || (dispatchDestination === "Análise Urbanística" && !dispatchTargetAnalystId)}
                      onClick={() => void saveTechnicalDispatch(process)}>Registrar despacho</Button>
                  </div>
                </div>
              ) : null}
              {isExpanded && process.dispatches.length > 0 ? (
                <div className="mx-5 mb-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-slate-800 dark:border-sky-800 dark:bg-slate-800 dark:text-slate-100">
                  <p className="font-bold text-sky-900 dark:text-sky-200">Último despacho / encaminhamento</p>
                  <p className="mt-1 whitespace-pre-wrap">{process.dispatches[0].subject}</p>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">Destino: {process.dispatches[0].to}{process.dispatches[0].assignedTo ? ` · ${process.dispatches[0].assignedTo}` : ""}</p>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">Despachado por: <strong className="text-slate-900 dark:text-white">{resolveProcessDispatchAuthor(process.dispatches[0], sessionUsers) || "Identificação não registrada neste despacho"}</strong></p>
                </div>
              ) : null}
              {isExpanded ? (
                <div id={`analysis-process-details-${process.id}`} className="border-t border-slate-100 bg-slate-50/35 pb-1 dark:border-slate-700 dark:bg-slate-950/15">
              <div className="sig-responsive-data-grid mx-5 mt-4">
                <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                  <p className="sig-label">Responsável pela análise</p>
                  <p className="sig-fit-title mt-2 text-sm font-semibold leading-6 text-slate-950" title={currentAnalyst}>
                    {currentAnalyst}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {analysisStarted
                      ? canEditAnalysis
                        ? "Análise atribuída a você / intervenção ativa"
                        : "Processo protegido: acompanhamento em leitura"
                      : isSupervisorView
                        ? "Aguardando distribuição para um analista"
                        : "Clique em Assumir análise para registrar o responsável de referência; a equipe da Análise continua com acesso técnico"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="sig-label">Etapa atual</p>
                  <p className="sig-fit-title mt-2 text-sm font-semibold leading-6 text-slate-950" title={process.sla.currentStage}>
                    {process.sla.currentStage}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Status operacional</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="sig-label">Prazo</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{process.sla.dueDate}</p>
                  <p className="mt-1 text-xs text-slate-500">{process.sla.hoursRemaining}h restantes</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="sig-label">Pendências</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{pendingRequirements.length}</p>
                  <p className="mt-1 sig-fit-copy text-xs text-slate-500" title={pendingRequirements[0]?.title || "Sem exigências abertas"}>
                    {pendingRequirements[0]?.title || "Sem exigências abertas"}
                  </p>
                </div>
                <div className={`rounded-2xl border p-4 ${missingRequiredDocuments > 0 ? "border-amber-200 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/70"}`}>
                  <p className="sig-label">Documentos obrigatórios</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {uploadedRequiredDocuments.length}/{requiredDocuments.length || checklist?.items.filter((item) => item.required).length || 0} enviados
                  </p>
                  <p className="mt-1 sig-fit-copy text-xs text-slate-500" title={process.checklistType}>
                    {missingRequiredDocuments > 0 ? `${missingRequiredDocuments} pendente(s) para análise` : "Documentação obrigatória disponível"}
                  </p>
                </div>
              </div>

              <div className="mx-5 mt-4 flex flex-wrap gap-2">
                {process.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="rounded-full border-0"
                    style={{
                      backgroundColor: `${parseMarker(tag).color}22`,
                      color: parseMarker(tag).color,
                    }}
                  >
                    {parseMarker(tag).label}
                  </Badge>
                ))}
              </div>

              <div className="mx-5 mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {isSupervisorView && !hasAssignedAnalyst ? (
                  <>
                    <Select
                      value={assignmentTargets[process.id] || analysisTeamLoad[0]?.analyst.id || ""}
                      onValueChange={(value) =>
                        setAssignmentTargets((current) => ({ ...current, [process.id]: value }))
                      }
                    >
                      <SelectTrigger className="h-11 w-full rounded-full border-slate-300 bg-white sm:w-[260px]">
                        <SelectValue placeholder="Selecionar analista" />
                      </SelectTrigger>
                      <SelectContent>
                        {analysisTeamLoad.map(({ analyst, active }) => (
                          <SelectItem key={analyst.id} value={analyst.id}>
                            {analyst.name} · {active} ativo(s)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      className="h-11 w-full rounded-full bg-sky-700 text-white hover:bg-sky-800 sm:w-auto"
                      disabled={Boolean(actionBusy) || analysisTeamLoad.length === 0}
                      onClick={() => void handleAssignAnalysis(process)}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      {actionBusy === `assign-${process.id}` ? "Distribuindo..." : "Distribuir análise"}
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant={analysisStarted ? "default" : "outline"}
                  className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void handleStartAnalysis(process)}
                >
                  {actionBusy === `start-${process.id}`
                    ? "Iniciando..."
                    : isSupervisorView
                      ? "Abrir acompanhamento"
                      : analysisStarted
                        ? canEditAnalysis
                          ? "Continuar análise"
                          : "Abrir análise"
                        : hasAssignedAnalyst
                          ? assignedToCurrentSession
                            ? "Iniciar minha análise"
                            : "Abrir análise"
                          : "Assumir análise"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto"
                  disabled={Boolean(actionBusy) || !canEditAnalysis || !analysisStarted}
                  onClick={() =>
                    void runAnalystAction(
                      `requirement-${process.id}`,
                      "Exigência técnica registrada no banco oficial.",
                      () =>
                        createRequirement({
                          processId: process.id,
                          actor: session.name,
                          title: "Complementar documentação técnica",
                          description:
                            "Apresentar ajustes técnicos e anexos complementares para continuidade da análise.",
                          dueDate: isoDateAfterDays(3),
                          targetName: process.technicalLead,
                          visibility: "misto",
                        }),
                    )
                  }
                >
                  Emitir exigência
                </Button>
                {issStageEnabled && !issSatisfied ? (
                  issGuide?.status === "pendente" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto"
                      disabled
                    >
                      ISSQN aguardando pagamento
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto"
                      disabled={Boolean(actionBusy) || !canEditAnalysis || !analysisStarted || pendingRequirements.length > 0 || missingRequiredDocuments > 0}
                      onClick={() =>
                        void runAnalystAction(
                          `iptu-${process.id}`,
                          "Processo encaminhado ao IPTU/Fiscal para emissão do ISSQN.",
                          () =>
                            dispatchProcess({
                              processId: process.id,
                              actor: session.name,
                              from: "Análise Urbanística",
                              to: "Setor de IPTU / Fiscal",
                              subject: "Conferência fiscal e emissão da guia de ISSQN",
                              dueDate: isoDateAfterDays(3),
                              visibility: "interno",
                            }),
                        )
                      }
                    >
                      <Send className="mr-2 h-4 w-4 text-sky-200" />
                      Encaminhar ao IPTU / Fiscal
                    </Button>
                  )
                ) : finalFeeEnabled ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto"
                    disabled={Boolean(actionBusy) || !canEditAnalysis || !analysisStarted || pendingRequirements.length > 0 || missingRequiredDocuments > 0}
                    onClick={() =>
                      void runAnalystAction(
                        `finance-${process.id}`,
                        "Processo encaminhado ao Financeiro para fechamento e taxa final.",
                        () =>
                          dispatchProcess({
                            processId: process.id,
                            actor: session.name,
                            from: "Análise Urbanística",
                            to: "Financeiro",
                            subject:
                              dispatchTemplate?.title ||
                              "Parecer técnico concluído — conferência financeira e taxa final",
                            dueDate: isoDateAfterDays(3),
                            visibility: "interno",
                          }),
                      )
                    }
                  >
                    <Send className="mr-2 h-4 w-4 text-sky-200" />
                    Encaminhar ao Financeiro
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto"
                    disabled={Boolean(actionBusy) || !canEditAnalysis || !analysisStarted || pendingRequirements.length > 0 || missingRequiredDocuments > 0}
                    onClick={() =>
                      void runAnalystAction(
                        `defer-${process.id}`,
                        "Processo deferido sem taxa final, conforme workflow da Prefeitura.",
                        () =>
                          updateProcessStatus({
                            processId: process.id,
                            status: "deferido",
                            actor: session.name,
                            title: "Processo deferido",
                            detail: "Análise Urbanística concluída. Taxa final desativada no workflow financeiro municipal.",
                          }),
                      )
                    }
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-300" />
                    Deferir processo
                  </Button>
                )}

              </div>

              <div className="mt-5 flex justify-end border-t border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/35">
                <Link
                  to={buildProcessPath(process)}
                  data-primary-action="process"
                  className="sig-primary-process-action inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-5 text-[12px] font-bold !text-white shadow-[0_8px_20px_rgba(7,89,133,0.22)] transition hover:-translate-y-px hover:brightness-105 sm:w-[190px] [&_*]:!text-white"
                >
                  <Eye className="h-4 w-4 shrink-0 !text-white" />
                  Abrir processo
                </Link>
              </div>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );

  const readVisibleOfficialLogo = () => {
    const element = document.querySelector<HTMLImageElement>(
      'header[data-sigapro-compact-header="true"] .sig-institution-logo-surface[data-logo-context="municipality"] img',
    );
    if (!element?.complete || element.naturalWidth <= 0 || element.naturalHeight <= 0) return undefined;
    try {
      const canvas = document.createElement("canvas");
      const width = 256;
      canvas.width = width;
      canvas.height = Math.max(1, Math.round(width * element.naturalHeight / element.naturalWidth));
      const context = canvas.getContext("2d");
      if (!context) return undefined;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } catch {
      // Imagens R2 que não oferecem CORS ainda aparecem na tela, mas não podem
      // ser copiadas para canvas. Não substituir por brasão fictício.
      return undefined;
    }
  };

  const handleExportPdf = async () => {
    if (!remoteSyncedForCurrentUser || exportBusy) return;
    setExportBusy(true);
    setExportError("");
    try {
      const issuedAt = new Date();
      const exportRows = buildAnalysisQueueExportRows(processRegistry, resolveAssignedAnalystName);
      const report = await createAnalysisQueuePdf(exportRows, {
        municipality: municipality?.name || "Prefeitura não identificada",
        department: currentUnit,
        generatedBy: session.name || "Usuário autenticado",
        generatedAt: issuedAt,
        logoDataUrl: readVisibleOfficialLogo(),
        filterDescription: [
          showArchived ? "Arquivados do meu perfil" : "Registro oficial da análise",
          search.trim() ? "Pesquisa: " + search.trim() : "Sem pesquisa",
        ].join(" · "),
      });
      downloadAnalysisQueuePdf(report, issuedAt);
    } catch {
      setExportError("Não foi possível gerar o PDF. Confira os registros oficiais e tente novamente.");
    } finally {
      setExportBusy(false);
    }
  };

  const handleExportCsv = () => {
    if (!remoteSyncedForCurrentUser) return;
    setExportError("");
    try {
      downloadAnalysisQueueCsv(buildAnalysisQueueExportRows(processRegistry, resolveAssignedAnalystName));
    } catch {
      setExportError("Não foi possível gerar a planilha CSV. Tente novamente.");
    }
  };

  const renderProcessRegistry = () => (
    <div className="space-y-3" data-analysis-registry-state={remoteSyncedForCurrentUser ? "confirmed" : "pending"}>
      <div data-analysis-queue-guide="true" className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5 text-xs dark:border-slate-700">
        <p role="status" className="font-semibold text-slate-700 dark:text-slate-200">
          {remoteSyncedForCurrentUser
            ? "Consulta oficial confirmada · " + registryPagination.total + " processo(s) nesta visualização"
            : "Sincronização pendente — aguardando confirmação do banco"}
        </p>
        <p className="text-slate-500 dark:text-slate-400">Clique no número para abrir o processo.</p>
      </div>

      <div data-analysis-registry-pagination="true" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
        <p className="font-semibold">Exibindo {registryPagination.from}–{registryPagination.to} de {registryPagination.total} processos oficiais</p>
        {registryPagination.pages > 1 ? (
          <nav aria-label="Páginas dos processos oficiais" className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={registryPagination.page <= 1}
              onClick={() => setRegistryPage((current) => Math.max(1, current - 1))}>Anterior</Button>
            <span className="min-w-20 text-center text-xs font-bold" aria-live="polite">Página {registryPagination.page} de {registryPagination.pages}</span>
            <Button type="button" variant="outline" size="sm" disabled={registryPagination.page >= registryPagination.pages}
              onClick={() => setRegistryPage((current) => Math.min(registryPagination.pages, current + 1))}>Próxima</Button>
          </nav>
        ) : null}
      </div>

      {renderQueue(
        registryPagination.items,
        showArchived
          ? "Nenhum processo arquivado nesta lista."
          : "Nenhum processo da Análise encontrado com os filtros atuais.",
        true,
      )}
    </div>
  );

  return (
    <PortalFrame eyebrow="MESA TÉCNICA" title="Fila técnica, SLA e decisões" compactHeader>
      <PageShell className="sig-analysis-page !flex !flex-col !gap-3 !pb-5">
        <section data-analysis-command-bar="true"
          className="flex min-w-0 flex-col gap-4 rounded-[18px] border border-slate-200 bg-white px-4 py-4 shadow-[0_8px_22px_rgba(15,23,42,0.045)] dark:border-slate-700 dark:bg-slate-900 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-slate-950 text-white dark:bg-sky-800">
              <ListTodo className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] !text-sky-800 dark:!text-sky-200">Operação municipal · Análise técnica</p>
              <h2 className="mt-0.5 text-lg font-extrabold tracking-tight !text-slate-950 dark:!text-white sm:text-xl">Mesa de processos</h2>
              <p className="mt-0.5 text-xs !text-slate-600 dark:!text-slate-300">Fila, prazos, encaminhamentos e relatórios em um só lugar.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
            <span className="hidden shrink-0 items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 2xl:inline-flex" role="status">
              <span className={remoteSyncedForCurrentUser ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-amber-500"} />
              {remoteSyncedForCurrentUser ? "Banco confirmado" : "Aguardando sincronização"}
            </span>
            <Button type="button" variant="outline"
              className="h-10 w-full rounded-xl border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white sm:w-auto"
              disabled={!remoteSyncedForCurrentUser}
              onClick={handleExportCsv}
              title="Exportar registros do filtro atual para planilha UTF-8">
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Planilha CSV
            </Button>
            <Button type="button"
              className="h-10 w-full rounded-xl bg-[#0c5275] px-5 text-xs font-extrabold !text-white shadow-[0_5px_14px_rgba(12,82,117,0.16)] hover:bg-[#063b58] sm:w-auto"
              disabled={!remoteSyncedForCurrentUser || exportBusy}
              onClick={() => void handleExportPdf()}
              title="Relatório institucional paginado em PDF, com todos os registros do filtro atual">
              <Download className="mr-1.5 h-4 w-4 !text-white" aria-hidden="true" />
              {exportBusy ? "Gerando PDF…" : "Exportar fila em PDF"}
            </Button>
          </div>
        </section>
        {exportError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">{exportError}</p> : null}

        {!remoteSyncedForCurrentUser ? (
          <div
            role={platformDataError ? "alert" : "status"}
            data-analysis-sync-state={platformDataError ? "error" : "pending"}
            className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${platformDataError
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-sky-200 bg-sky-50 text-slate-900"}`}
          >
            <div className="min-w-0">
              <p className="font-bold">
                {platformDataError ? "Sincronização oficial não confirmada" : "Sincronizando processos com o Neon..."}
              </p>
              <p className="mt-1 text-xs leading-5">
                {platformDataError || (
                  platformDataLoading
                    ? "Consultando os protocolos, suas guias e a atribuição técnica."
                    : "Aguardando validação da sessão e dos dados oficiais. Nenhum processo foi excluído."
                )}
              </p>
            </div>
            <Button type="button" variant="outline" className="shrink-0 border-slate-300 bg-white text-slate-900"
              onClick={() => { void refreshRemoteStore().catch(() => undefined); }}>
              Atualizar do banco
            </Button>
          </div>
        ) : null}

        {actionStatus ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              actionStatus.startsWith("Não foi possível")
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {actionStatus}
          </div>
        ) : null}

        <InternalTabs
          className="sig-analysis-tabs"
          items={navItems as unknown as Array<{ value: string; label: string; helper?: string }>}
          value={section}
          onChange={(value) => setSection(value as AnalystSection)}
        />

        {section === "visao-geral" && (
          <>
            {import.meta.env.VITE_SIGAPRO_NEON_ISOLATED==="true" &&
              (session.role==="analista"||session.role==="prefeitura_supervisor") ? (
                <QaArchitecturalLab municipalityId={effectiveScopeId} />
              ) : null}
            <PageStatsRow>
              <StatCard label="Em análise" value={String(inReview.length)} description="Pareceres em andamento" icon={Stamp} tone="blue" />
              <StatCard label="Pendências" value={String(requirementsOpen)} description="Exigências abertas" icon={Clock3} tone="amber" />
              <StatCard label="SLA crítico" value={String(slaCritical.length)} description="Prazo curto ou vencido" icon={TimerReset} tone="rose" />
              <StatCard label="Concluídos" value={String(completed.length)} description="Decisões finalizadas" icon={CheckCircle2} tone="emerald" />
            </PageStatsRow>

            <div data-analysis-official-processes="true">
              <TableCard
                title="Processos oficiais da Prefeitura"
                description="Registro do município com o status real de cada processo. Arquivamentos pessoais não escondem processos da visão principal. Os cinco primeiros aparecem abaixo."
                icon={ListTodo}
                actions={
                  <Button type="button" variant="outline" className="rounded-full"
                    onClick={() => setSection("fila")}>
                    Abrir lista completa
                  </Button>
                }
              >
                <p role="status" className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                  {remoteSyncedForCurrentUser
                    ? `Neon confirmou ${allProcesses.length} registro(s) acessível(is) à sessão e ${analysisRegistryBase.length} processo(s) nesta Análise.`
                    : "Aguardando confirmação dos processos no Neon; não é uma lista vazia definitiva."}
                </p>
                {renderQueue(
                  processRegistry.slice(0, 5),
                  remoteSyncedForCurrentUser
                    ? allProcesses.length > 0
                      ? "Existem registros no banco, mas nenhum corresponde à Prefeitura e ao perfil desta Análise. Confira município e filtros."
                      : "Nenhum processo retornou para esta conta na consulta oficial."
                    : "A consulta oficial ainda está sincronizando. Nenhum processo foi excluído.",
                )}
              </TableCard>
            </div>

            <PageMainGrid>
              <PageMainContent>
                <TableCard
                  title="Prioridades da mesa técnica"
                  description="Apenas os processos que precisam de leitura primeiro. A fila completa fica na aba Fila de análise."
                  icon={ListTodo}
                  actions={
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => setSection("fila")}>
                      Ver todos os processos
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    {urgentProtocols.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                        Nenhum processo prioritário no momento.
                      </div>
                    ) : (
                      urgentProtocols.slice(0, 4).map((process) => (
                        <div key={process.id} data-process-premium-card="true" className="flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-px hover:shadow-[0_16px_34px_rgba(15,23,42,0.10)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_14px_34px_rgba(0,0,0,0.22)] lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="sig-fit-title text-sm font-semibold text-slate-950 dark:text-white">
                                {formatOfficialProcessNumber(process.protocol)}
                              </p>
                              <Badge className={`rounded-full border ${getPriorityBadge(process)}`}>
                                {getPriorityLabel(process)}
                              </Badge>
                              <Badge variant="outline" className={statusTone(process.status)}>
                                {statusLabel(process.status)}
                              </Badge>
                            </div>
                            <p className="mt-1 line-clamp-1 text-sm text-slate-600 dark:text-slate-400">
                              {formatOfficialProcessTitle({ title: process.title, type: process.type })}
                            </p>
                          </div>
                          <Button asChild className="shrink-0 rounded-full bg-[linear-gradient(135deg,#0b5e93_0%,#0f78b8_100%)] px-5 font-semibold !text-white shadow-[0_8px_20px_rgba(14,116,181,0.22)] hover:brightness-105 [&_*]:!text-white">
                            <Link to={buildProcessPath(process, "analise")}>Abrir análise</Link>
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </TableCard>

                {handedOffFromAnalysis.length > 0 ? (
                  <TableCard
                    title="Encaminhados pela Análise"
                    description="Processos já trabalhados pela Análise Urbanística que seguiram para outra etapa. Eles permanecem rastreáveis aqui e não somem da pasta técnica."
                    icon={Send}
                  >
                    <div className="space-y-3">
                      {handedOffFromAnalysis.slice(0, 5).map((process) => (
                        <div key={process.id} data-process-premium-card="true" className="flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-px hover:shadow-[0_16px_34px_rgba(15,23,42,0.10)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_14px_34px_rgba(0,0,0,0.22)] lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="sig-fit-title text-sm font-semibold text-slate-950 dark:text-white">
                                {formatOfficialProcessNumber(process.protocol)}
                              </p>
                              <Badge variant="outline" className={statusTone(process.status)}>
                                {statusLabel(process.status)}
                              </Badge>
                              <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-sky-800">
                                {process.processControl?.currentFolder || process.sla.currentStage}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                              Responsável pela análise: {process.analysis?.assignedTo || "Não atribuído"}
                            </p>
                          </div>
                          <Button asChild variant="outline" className="shrink-0 rounded-full">
                            <Link to={buildProcessPath(process, "analise")}>Consultar análise</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </TableCard>
                ) : null}
              </PageMainContent>

              <PageSideContent>
                <SectionCard title="Atenção imediata" description="Indicadores que realmente pedem atuação.">
                  <div className="space-y-3">
                    <AlertCard
                      title="Prazo crítico"
                      description={slaCritical.length > 0 ? `${slaCritical.length} processo(s) exigem ação imediata.` : "Nenhum prazo crítico agora."}
                      tone={slaCritical.length > 0 ? "danger" : "success"}
                      icon={Clock3}
                    />
                    <AlertCard
                      title="Exigências abertas"
                      description={requirementsOpen > 0 ? `${requirementsOpen} exigência(s) aguardam leitura ou retorno.` : "Nenhuma exigência técnica aberta."}
                      tone={requirementsOpen > 0 ? "warning" : "success"}
                      icon={FileText}
                    />
                  </div>
                </SectionCard>

                <SectionCard title="Ações rápidas" description="Atalhos para a rotina da análise.">
                  <div className="grid gap-2">
                    <Button type="button" className="sig-force-dark-action h-11 justify-start rounded-2xl bg-slate-950 !text-white hover:bg-slate-900" onClick={() => setSection("fila")}>
                      <ListTodo className="mr-2 h-4 w-4" />
                      Abrir fila de análise
                    </Button>
                    <Button type="button" variant="outline" className="h-11 justify-start rounded-2xl" onClick={() => setSection("pendencias")}>
                      <FileText className="mr-2 h-4 w-4" />
                      Ver pendências
                    </Button>
                    <Button type="button" variant="outline" className="h-11 justify-start rounded-2xl" onClick={() => setSection("correcoes")}>
                      <Send className="mr-2 h-4 w-4" />
                      Correções solicitadas
                    </Button>
                  </div>
                </SectionCard>
              </PageSideContent>
            </PageMainGrid>
          </>
        )}

        {section === "fila" && (
          <>
            <section data-analysis-process-panel="true" className="min-w-0 overflow-hidden rounded-[19px] border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.045)] dark:border-slate-700 dark:bg-slate-900">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/75 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#dcebf4] text-[#075985] dark:bg-sky-950 dark:text-sky-200">
                    <ListTodo className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold !text-slate-900 dark:!text-white sm:text-base">Processos da Análise</h3>
                    <p className="text-[11px] !text-slate-600 dark:!text-slate-300">Ativos, encaminhados e concluídos. Abra um registro para consultar ou atuar.</p>
                  </div>
                </div>
                <span className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-extrabold text-[#075985] dark:border-sky-800 dark:bg-slate-900 dark:text-sky-200" role="status">
                  {processRegistry.length} registro(s)
                </span>
              </header>
              <div className="space-y-3 p-3 sm:p-4">
                <div data-analysis-filters="true" className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="sig-search-icon pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar processo, proprietário, endereço, IPTU ou analista"
                      aria-label="Pesquisar processos da análise"
                      className="h-10 w-full rounded-xl border-slate-300 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:border-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <Button type="button" variant="outline"
                    className="h-10 shrink-0 rounded-xl border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    onClick={() => setShowArchived((current) => !current)}>
                    {showArchived ? <ListTodo className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                    {showArchived ? "Voltar à lista completa" : "Arquivados (" + archivedProcessIds.length + ")"}
                  </Button>
                </div>
                {renderProcessRegistry()}
              </div>
            </section>

            <details data-analysis-team-disclosure="true" className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <summary className="cursor-pointer rounded-xl px-3 py-2 text-sm font-bold text-slate-900 marker:text-sky-700 dark:text-slate-100">
                Distribuição da equipe e carga de trabalho — expandir quando necessário
              </summary>
            <div
              data-analysis-distribution-manager="true"
              className="mb-4 overflow-hidden rounded-[22px] border border-white/15 bg-[linear-gradient(180deg,#102637_0%,#0b1c2e_100%)] shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
            >
              <div className="flex flex-col gap-3 border-b border-white/10 bg-[linear-gradient(135deg,#132d42_0%,#102438_100%)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Users2 className="h-5 w-5 text-sky-200" />
                    <h2 className="text-sm font-extrabold text-white">Gerenciador de distribuição da Análise</h2>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    Um processo sem responsável fica na fila comum. A atribuição define o responsável de referência para carga, SLA e auditoria, sem bloquear a colaboração técnica dos demais analistas da unidade.
                  </p>
                </div>

              </div>

              <div data-analysis-distribution-grid="true" className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-200">Aguardando distribuição</p>
                  <p className="mt-2 text-2xl font-black text-white">{unassignedAnalysis.length}</p>
                  <p className="mt-1 text-xs text-slate-300">Novos processos ainda sem analista responsável.</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-200">Minhas análises</p>
                  <p className="mt-2 text-2xl font-black text-white">{myAnalyses.length}</p>
                  <p className="mt-1 text-xs text-slate-300">Processos reservados para o usuário atual.</p>
                </div>
                <div className="rounded-2xl border border-sky-400/25 bg-sky-400/10 p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-sky-200">Equipe em andamento</p>
                  <p className="mt-2 text-2xl font-black text-white">{teamAssignedAnalysis.length}</p>
                  <p className="mt-1 text-xs text-slate-300">Processos com responsável de referência; a equipe técnica da Análise pode colaborar quando necessário.</p>
                </div>
                <div data-analysis-availability-card="true" className="rounded-2xl border border-slate-400/30 bg-[#20364b] p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-200">Equipe disponível</p>
                  <p className="mt-2 text-2xl font-black text-white">{analysisTeam.length}</p>
                  <p className="mt-1 text-xs text-slate-300">
                    {analysisTeamLoad[0]
                      ? `Menor carga: ${analysisTeamLoad[0].analyst.name} (${analysisTeamLoad[0].active})`
                      : "Nenhum analista ativo cadastrado."}
                  </p>
                </div>
              </div>

              {analysisTeamLoad.length > 0 ? (
                <div className="border-t border-white/10 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {analysisTeamLoad.map(({ analyst, active }) => (
                      <span
                        key={analyst.id}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm"
                      >
                        <UserCheck className="mr-1.5 h-3.5 w-3.5 text-sky-700" />
                        {analyst.name}
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                          {active}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            </details>

          </>
        )}

        {section === "concluidos" && (
          <TableCard
            title="Processos concluídos"
            description="Processos finalizados permanecem disponíveis para consulta, histórico e eventual reabertura. Arquivar remove somente da sua visualização pessoal."
            icon={CheckCircle2}
            actions={
              <div className="relative w-full max-w-xl">
                <Search className="sig-search-icon sig-analysis-search-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar concluído por processo, proprietário, endereço ou IPTU"
                  className="h-11 rounded-[14px] border-slate-200 bg-white pl-11 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            }
          >
            {renderQueue(
              visibleCompleted.filter(filterBySearch),
              "Nenhum processo concluído encontrado.",
              true,
            )}
          </TableCard>
        )}

        {section === "pendencias" && (
          <PageMainGrid>
            <PageMainContent>
              <TableCard
                title="Pendências técnicas"
                description="Bloqueios documentais, inconsistências formais e exigências que impedem o avanço da análise."
                icon={FileText}
              >
                {renderQueue(
                  queue.filter(
                    (process) =>
                      getOpenRequirements(process).length > 0 ||
                      process.status === "pendencia_documental" ||
                      process.status === "exigencia",
                  ),
                  "Nenhum item com pendência técnica no momento.",
                )}
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Situação das pendências" description="Leitura rápida do que está travando a mesa técnica.">
                <div className="space-y-3">
                  <AlertCard
                    title="Documentação"
                    description={`${blockedItems.filter((item) => item.status === "pendencia_documental").length} processo(s) com bloqueio documental.`}
                    tone={blockedItems.some((item) => item.status === "pendencia_documental") ? "warning" : "success"}
                    icon={FileText}
                  />
                  <AlertCard
                    title="💰 Pagamento"
                    description="Pagamentos ficam na fila do Protocolo/Financeiro e não entram na mesa urbanística."
                    tone={blockedItems.some((item) => item.status === "pagamento_pendente") ? "warning" : "success"}
                    icon={TimerReset}
                  />
                  <AlertCard
                    title="⚠ Exigências abertas"
                    description={`${requirementsOpen} exigência(s) ainda pedem leitura ou retorno do requerente.`}
                    tone={requirementsOpen > 0 ? "warning" : "success"}
                    icon={Clock3}
                  />
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        )}

        {section === "correcoes" && (
          <PageMainGrid>
            <PageMainContent>
              <TableCard
                title="Correções solicitadas"
                description="Itens em reapresentação, exigência ou aguardando retorno para nova leitura técnica."
                icon={FileText}
              >
                {renderQueue(correctionQueue, "Nenhuma correção solicitada em aberto no momento.")}
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Status das correções" description="Retorno pendente, atraso e comunicação com o requerente.">
                <div className="space-y-3">
                  <AlertCard
                    title="📌 Aguardando retorno"
                    description={`${correctionQueue.length} processo(s) aguardam reapresentação ou ajuste técnico.`}
                    tone={correctionQueue.length > 0 ? "warning" : "success"}
                    icon={FileText}
                  />
                  <AlertCard
                    title="⏱ Resposta crítica"
                    description={`${correctionQueue.filter((item) => item.sla.breached || item.sla.hoursRemaining <= 12).length} item(ns) com prazo curto ou vencido.`}
                    tone={correctionQueue.some((item) => item.sla.breached || item.sla.hoursRemaining <= 12) ? "danger" : "success"}
                    icon={Clock3}
                  />
                  <AlertCard
                    title="📬 Comunicação"
                    description={
                      correctionQueue.length > 0
                        ? "Há solicitações técnicas que exigem acompanhamento ativo do retorno."
                        : "Nenhuma correção em acompanhamento no momento."
                    }
                    tone={correctionQueue.length > 0 ? "warning" : "success"}
                    icon={Send}
                  />
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        )}

        {section === "historico" && (
          <PageMainGrid>
            <PageMainContent>
              <TableCard
                title="Histórico técnico"
                description="Comentários, movimentos recentes, decisões e registros da atuação técnica, inclusive depois que o processo segue para Financeiro ou outro setor."
                icon={Clock3}
                actions={
                  <div className="relative w-full max-w-xl">
                    <Search className="sig-search-icon sig-analysis-search-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar protocolo, IPTU, proprietário ou endereço"
                      className="h-11 rounded-2xl border-slate-200 pl-11"
                    />
                  </div>
                }
              >
                <div className="space-y-3">
                  {recentActivity.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                      Nenhuma movimentação técnica recente encontrada.
                    </div>
                  ) : (
                    recentActivity.map((item) => (
                      <div key={item.id} data-surface="adaptive-card" className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(item.protocol)}</p>
                              <Badge variant="outline" className={statusTone(item.status)}>
                                {statusLabel(item.status)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm font-medium text-slate-800">{item.title}</p>
                            <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-start gap-2 text-sm text-slate-500 md:items-end">
                            <div>
                              <p>{item.actor}</p>
                              <p>{item.at}</p>
                            </div>
                            <Button asChild variant="outline" size="sm" className="rounded-full">
                              <Link to={buildProcessPath({ id: item.processId, protocol: item.protocol }, "analise")}>Abrir processo</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Painel histórico" description="Processos analisados, encaminhados, concluídos e itens atribuídos ao analista.">
                <div className="space-y-3">
                  {handedOffFromAnalysis.slice(0, 5).map((process) => (
                    <div key={`handoff-${process.id}`} className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="sig-fit-title text-sm font-semibold text-slate-950 dark:text-white">{formatOfficialProcessNumber(process.protocol)}</p>
                          <p className="mt-1 sig-fit-copy text-sm text-slate-600">
                            Encaminhado para {process.processControl?.currentFolder || process.sla.currentStage}
                          </p>
                        </div>
                        <Badge variant="outline" className={statusTone(process.status)}>
                          {statusLabel(process.status)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {handedOffFromAnalysis.length > 0 ? <div className="border-t border-slate-100 pt-3" /> : null}
                  {recentDecisions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Nenhuma decisão concluída ainda.
                    </div>
                  ) : (
                    recentDecisions.map((process) => (
                      <div key={process.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(process.protocol)}</p>
                        <p className="mt-1 text-sm text-slate-800">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                        <p className="mt-1 text-sm text-slate-500">{process.ownerName}</p>
                      </div>
                    ))
                  )}
                  <div className="border-t border-slate-100 pt-3" />
                  {latestAssigned.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Nenhum item atribuído diretamente a você.
                    </div>
                  ) : (
                    latestAssigned.map((process) => (
                      <div key={process.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="sig-fit-title text-sm font-semibold text-slate-950 dark:text-white">{formatOfficialProcessNumber(process.protocol)}</p>
                            <p className="mt-1 sig-fit-copy text-sm text-slate-500">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                          </div>
                          <Badge variant="outline" className={statusTone(process.status)}>
                            {statusLabel(process.status)}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        )}

        {section === "indicadores" && (
          <PageMainGrid>
            <PageMainContent>
              <TableCard
                title="Indicadores e SLA"
                description="Carga da equipe, tempo médio, vencimentos e leitura consolidada do desempenho técnico."
                icon={Users2}
              >
                <div className="sig-responsive-data-grid sig-responsive-data-grid-wide">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="sig-label">Tempo médio</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{averageSlaHours}h</p>
                    <p className="mt-1 text-sm text-slate-500">Média de horas restantes na fila</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="sig-label">SLA vencido</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {processes.filter((item) => item.sla.breached).length}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">Itens que pedem reação imediata</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="sig-label">Carga atribuída</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{latestAssigned.length}</p>
                    <p className="mt-1 text-sm text-slate-500">Itens em nome do analista atual</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="sig-label">Equipe monitorada</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{productivityByAnalyst.length}</p>
                    <p className="mt-1 text-sm text-slate-500">Responsáveis técnicos com carga ativa</p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {productivityByAnalyst.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Sem produtividade consolidada ainda.
                    </div>
                  ) : (
                    productivityByAnalyst.map((item) => (
                      <div key={item.analyst} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-950">{item.analyst}</p>
                        <div className="sig-responsive-data-grid mt-3 text-sm text-slate-600">
                          <div className="rounded-xl bg-slate-50 p-3">Fila: {item.total}</div>
                          <div className="rounded-xl bg-slate-50 p-3">Concluídos: {item.deferidos}</div>
                          <div className="rounded-xl bg-slate-50 p-3">Pendências: {item.exigencias}</div>
                          <div className="rounded-xl bg-slate-50 p-3">
                            Participação: {item.total > 0 && processes.length > 0 ? Math.round((item.total / processes.length) * 100) : 0}%
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Leitura executiva" description="Resumo curto dos prazos e da produtividade da equipe técnica.">
                <div className="space-y-3">
                  <AlertCard
                    title="⏱ Prazo crítico"
                    description={`${slaCritical.length} item(ns) sob atenção imediata.`}
                    tone={slaCritical.length > 0 ? "danger" : "success"}
                    icon={Clock3}
                  />
                  <AlertCard
                    title="🧠 Em análise"
                    description={`${inReview.length} processo(s) em leitura técnica ativa.`}
                    tone={inReview.length > 0 ? "default" : "success"}
                    icon={Stamp}
                  />
                  <AlertCard
                    title="✅ Concluídos"
                    description={`${completed.length} deferimento(s) já finalizados.`}
                    tone={completed.length > 0 ? "success" : "default"}
                    icon={CheckCircle2}
                  />
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        )}
      </PageShell>
    </PortalFrame>
  );
}
