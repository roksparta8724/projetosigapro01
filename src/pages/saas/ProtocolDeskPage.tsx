import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileWarning,
  Globe2,
  Layers3,
  Search,
  Send,
  Store,
  Archive,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCard } from "@/components/platform/AlertCard";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageHeader } from "@/components/platform/PageHeader";
import { MarkerSelector } from "@/components/platform/MarkerSelector";
import {
  PageMainContent,
  PageMainGrid,
  PageShell,
  PageSideContent,
  PageStatsRow,
} from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { attachMunicipalCollectionGuide } from "@/lib/municipalCollectionBridge";
import { GovbrArGuideBridge } from "@/components/platform/GovbrArGuideBridge";
import { useEffectiveCollectionMode } from "@/hooks/useEffectiveCollectionMode";
import { SectionCard } from "@/components/platform/SectionCard";
import { StatCard } from "@/components/platform/StatCard";
import { TableCard } from "@/components/platform/TableCard";
import { UserAvatar } from "@/components/platform/UserAvatar";
import {
  buildProcessPath,
  isExternalProfessionalProcess,
  isProcessOwnedBySessionDepartment,
  formatCurrency,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getProcessPaymentGuides,
  matchesOperationalScope,
  parseMarker,
  statusLabel,
  statusTone,
  type ProcessRecord,
  URBAN_ANALYSIS_DEPARTMENT,
} from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useMarkerPresets } from "@/hooks/useMarkerPresets";
import {
  confirmRemotePreprotocolPayment,
  listRemotePendingPreprotocolPayments,
  type PendingPreprotocolPayment,
} from "@/integrations/backend/platform";

type ProtocolSection =
  | "visao-geral"
  | "todos"
  | "fila"
  | "entradas"
  | "documentos"
  | "pagamentos"
  | "balcao"
  | "online"
  | "historico";

function getOpeningDate(process: ProcessRecord) {
  return process.timeline[process.timeline.length - 1]?.at ?? process.payment.issuedAt ?? "-";
}

function getMissingRequiredDocuments(process: ProcessRecord) {
  return process.documents.filter((document) => document.required && !document.uploaded).length;
}

function getPendingTriageDocuments(process: ProcessRecord) {
  return process.documents.filter(
    (document) =>
      document.required &&
      (!document.uploaded || document.reviewStatus !== "aprovado"),
  ).length;
}

export function ProtocolDeskPage() {
  const { session } = usePlatformSession();
  const {
    processes: allProcesses,
    sessionUsers,
    getInstitutionSettings,
    markGuideAsPaid,
    updateProcessTriage,
    dispatchProcess,
    getUserProfile,
    refreshRemoteStore,
    sendProcessMessage,
  } = usePlatformData();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  // Para funcionário municipal, a Prefeitura vinculada à conta é a fonte
  // autoritativa do livro de protocolos. O contexto visual nunca pode trocar
  // silenciosamente o escopo e fazer registros oficiais desaparecerem.
  const effectiveScopeId =
    session.municipalityId ??
    session.tenantId ??
    municipality?.id ??
    scopeId ??
    null;

  const { canImportMunicipalGuide, configuration: collectionConfig } = useEffectiveCollectionMode(effectiveScopeId);

  const userById = useMemo(
    () => new Map(sessionUsers.map((user) => [user.id, user])),
    [sessionUsers],
  );

  const isExternalProfessionalSubmission = (process: ProcessRecord) =>
    isExternalProfessionalProcess(process);

  // "Todos os protocolos" é o livro de registro da Prefeitura:
  // depois que um protocolo é criado, ele nunca desaparece só porque mudou de setor.
  // Permissões operacionais continuam sendo aplicadas nas filas e ações abaixo.
  const processes = useMemo(
    () =>
      allProcesses.filter(
        (item) =>
          item.isOfficial !== false &&
          Boolean(effectiveScopeId) &&
          matchesOperationalScope(effectiveScopeId, item),
      ),
    [allProcesses, effectiveScopeId],
  );

  // A guia inicial do Cadastro Eventual pode nascer no pré-protocolo.
  // Incluir o pré-protocolo apenas no seletor GOVBR, sem oficializar o
  // livro de protocolos nem confirmar pagamento.
  const govbrEligibleProcesses = useMemo(
    () => allProcesses.filter((item) =>
      Boolean(effectiveScopeId) && matchesOperationalScope(effectiveScopeId, item)),
    [allProcesses, effectiveScopeId],
  );

  const protocolQueueProcesses = useMemo(
    () =>
      processes.filter((item) => {
        if (!isProcessOwnedBySessionDepartment(session, item)) return false;
        const currentFolder = (item.processControl?.currentFolder || "").toLowerCase();
        if (currentFolder) {
          return (
            currentFolder.includes("protocolo") ||
            currentFolder.includes("triagem") ||
            currentFolder.includes("recepção") ||
            currentFolder.includes("recepcao") ||
            currentFolder.includes("administr")
          );
        }

        // Compatibilidade somente para registros antigos ainda sem currentFolder.
        return [
          "protocolo",
          "triagem",
          "pendencia_documental",
          "guia_emitida",
          "pagamento_pendente",
          "pagamento_confirmado",
        ].includes(item.status);
      }),
    [processes, session],
  );

  const tenantSettings =
    institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId ?? session.tenantId);

  const { presets: markerPresets } = useMarkerPresets();
  const [protocolQuery, setProtocolQuery] = useState("");
  const [govbrProtocolQuery, setGovbrProtocolQuery] = useState("");
  const [govbrProtocolId, setGovbrProtocolId] = useState("");
  const [protocolActionStatus, setProtocolActionStatus] = useState("");
  const [protocolActionBusy, setProtocolActionBusy] = useState("");
  const [markerFilter, setMarkerFilter] = useState("todos");
  const [section, setSection] = useState<ProtocolSection>("visao-geral");
  const [pendingPreprotocolPayments, setPendingPreprotocolPayments] = useState<
    PendingPreprotocolPayment[]
  >([]);
  const [preprotocolPaymentsLoading, setPreprotocolPaymentsLoading] = useState(false);
  const [preprotocolPaymentsError, setPreprotocolPaymentsError] = useState("");

  const refreshPreprotocolPayments = useCallback(async () => {
    if (!effectiveScopeId) {
      setPendingPreprotocolPayments([]);
      return;
    }

    setPreprotocolPaymentsLoading(true);
    try {
      const items = await listRemotePendingPreprotocolPayments();
      setPendingPreprotocolPayments(items);
      setPreprotocolPaymentsError("");
    } catch (error) {
      setPreprotocolPaymentsError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar os pré-protocolos aguardando pagamento.",
      );
    } finally {
      setPreprotocolPaymentsLoading(false);
    }
  }, [effectiveScopeId]);

  useEffect(() => {
    void refreshPreprotocolPayments();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPreprotocolPayments();
      }
    };

    const timer = window.setInterval(refreshWhenVisible, 8000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshPreprotocolPayments]);

  const protocolMarkerLinks = useMemo(
    () =>
      markerPresets
        .filter((preset) => preset.active)
        .map((preset) => ({
          id: preset.id,
          label: preset.label,
          color: preset.color || "#2563eb",
          count: processes.filter((process) =>
            (process.tags ?? []).some(
              (tag) => parseMarker(tag).label.trim().toLowerCase() === preset.label.trim().toLowerCase(),
            ),
          ).length,
        })),
    [markerPresets, processes],
  );

  const markerFilteredProcesses = useMemo(() => {
    if (markerFilter === "todos") return processes;
    const selected = markerPresets.find((preset) => preset.id === markerFilter);
    if (!selected) return processes;
    const normalized = selected.label.trim().toLowerCase();
    return processes.filter((process) =>
      (process.tags ?? []).some(
        (tag) => parseMarker(tag).label.trim().toLowerCase() === normalized,
      ),
    );
  }, [markerFilter, markerPresets, processes]);
  const [processListQuery, setProcessListQuery] = useState("");
  const [expandedProcessIds, setExpandedProcessIds] = useState<Set<string>>(() => new Set());
  const [selectedProcessIds, setSelectedProcessIds] = useState<Set<string>>(() => new Set());
  const [finishedProcessIds, setFinishedProcessIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const recoveryKey = `sigapro.finished-processes.selection-recovery.v1.${session.id}`;
      const storageKey = `sigapro.finished-processes.${session.id}`;
      if (window.localStorage.getItem(recoveryKey) !== "1") {
        window.localStorage.removeItem(storageKey);
        window.localStorage.setItem(recoveryKey, "1");
        return new Set();
      }
      const raw = window.localStorage.getItem(storageKey);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const currentUnit = session.department || session.title || "Setor de protocolo";

  const queueItems = useMemo(
    () =>
      [...protocolQueueProcesses].sort((a, b) => {
        if (a.sla.breached !== b.sla.breached) return a.sla.breached ? -1 : 1;
        return a.sla.hoursRemaining - b.sla.hoursRemaining;
      }),
    [protocolQueueProcesses],
  );

  const newProtocols = protocolQueueProcesses.filter(
    (item) => item.triage.status === "recebido" || item.triage.status === "em_triagem",
  );
  const pendingDocuments = protocolQueueProcesses.filter((item) => getMissingRequiredDocuments(item) > 0);
  const incompleteProtocols = protocolQueueProcesses.filter(
    (item) => item.status === "pendencia_documental" || getMissingRequiredDocuments(item) > 0,
  );
  const triagedProtocols = protocolQueueProcesses.filter((item) => item.triage.status === "concluido");
  const pendingProtocolPayments = protocolQueueProcesses.filter((item) =>
    getProcessPaymentGuides(item, tenantSettings).some(
      (guide) => guide.kind === "protocolo" && guide.status === "pendente",
    ),
  );
  const confirmedProtocolPayments = processes.filter((item) =>
    getProcessPaymentGuides(item, tenantSettings).some(
      (guide) => guide.kind === "protocolo" && guide.status === "compensada",
    ),
  );
  const urgentProtocols = queueItems.filter(
    (item) => item.sla.breached || item.sla.hoursRemaining <= 8,
  );
  const deskProtocols = processes.filter((item) =>
    item.dispatches.some(
      (dispatch) =>
        dispatch.from === "Setor de protocolo" || dispatch.to === "Setor de protocolo",
    ),
  );
  const deskProtocolIds = new Set(deskProtocols.map((item) => item.id));
  const onlineProtocolItems = processes.filter(
    (item) => isExternalProfessionalSubmission(item) || !deskProtocolIds.has(item.id),
  );

  const latestActivity = useMemo(
    () =>
      processes
        .flatMap((process) =>
          process.timeline.slice(0, 2).map((entry) => ({
            id: `${process.id}-${entry.id}`,
            protocol: process.protocol,
            title: entry.title,
            detail: entry.detail,
            at: entry.at,
          })),
        )
        .slice(0, 10),
    [processes],
  );

  const matchedProcess = useMemo(() => {
    const normalized = protocolQuery.trim().toLowerCase();
    if (!normalized) return null;

    return (
      processes.find(
        (item) =>
          item.protocol.toLowerCase() === normalized ||
          item.externalProtocol.toLowerCase() === normalized ||
          getProcessPaymentGuides(item, tenantSettings).some(
            (guide) => guide.code.toLowerCase() === normalized,
          ),
      ) || null
    );
  }, [processes, protocolQuery, tenantSettings]);
  const dispatchRows = useMemo(
    () =>
      processes.flatMap((process) =>
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
    [processes],
  );
  const receivedAtProtocol = useMemo(
    () =>
      dispatchRows.filter(
        (item) =>
          item.to.toLowerCase().includes(currentUnit.toLowerCase()) ||
          item.currentFolder.toLowerCase().includes(currentUnit.toLowerCase()),
      ),
    [currentUnit, dispatchRows],
  );
  const generatedByProtocol = useMemo(
    () => dispatchRows.filter((item) => item.from.toLowerCase().includes(currentUnit.toLowerCase())),
    [currentUnit, dispatchRows],
  );
  const assignedAtProtocol = useMemo(
    () => dispatchRows.filter((item) => item.assignedTo).slice(0, 6),
    [dispatchRows],
  );
  const restrictedTransitCount = useMemo(
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

  const navItems = [
    { value: "visao-geral", label: "Resumo", helper: "Prioridades e situação do setor" },
    { value: "todos", label: "Todos os protocolos", helper: "Acompanhamento e rastreabilidade do Protocolo" },
    { value: "fila", label: "Fila de triagem", helper: "Operação principal do protocolo" },
    { value: "entradas", label: "Entradas", helper: "Separação por canal de recebimento" },
    { value: "documentos", label: "Documentos pendentes", helper: "Bloqueios, exigências e regularização" },
    { value: "pagamentos", label: "Pagamento do protocolo", helper: "Conferência e baixa da guia inicial" },
    { value: "balcao", label: "Atendimento balcão", helper: "Recepção presencial e apoio assistido" },
    { value: "online", label: "Atendimento online", helper: "Entrada digital e despacho inicial" },
    { value: "historico", label: "Histórico", helper: "Últimos registros e rastreabilidade" },
  ] as const;

  const persistFinishedProcesses = (ids: Set<string>) => {
    setFinishedProcessIds(new Set(ids));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        `sigapro.finished-processes.${session.id}`,
        JSON.stringify(Array.from(ids)),
      );
    }
  };

  const toggleProcessSelection = (processId: string) => {
    setSelectedProcessIds((current) => {
      const next = new Set(current);
      if (next.has(processId)) next.delete(processId);
      else next.add(processId);
      return next;
    });
  };

  const toggleProcessExpanded = (processId: string) => {
    setExpandedProcessIds((current) => {
      const next = new Set(current);
      if (next.has(processId)) next.delete(processId);
      else next.add(processId);
      return next;
    });
  };

  const finishSelectedInMyList = () => {
    if (selectedProcessIds.size === 0) return;
    const nextFinished = new Set(finishedProcessIds);
    selectedProcessIds.forEach((id) => nextFinished.add(id));
    persistFinishedProcesses(nextFinished);
    setSelectedProcessIds(new Set());
    setProtocolActionStatus(
      "Os processos selecionados foram finalizados somente na sua lista. Nenhum processo, documento ou histórico foi excluído.",
    );
  };

  const dispatchSelectedToUrbanism = async (sourceItems: ProcessRecord[]) => {
    const selected = sourceItems.filter(
      (process) =>
        selectedProcessIds.has(process.id) &&
        process.status === "pagamento_confirmado" &&
        isProcessOwnedBySessionDepartment(session, process),
    );

    if (selected.length === 0) {
      setProtocolActionStatus("Nenhum dos processos selecionados está liberado para despacho ao Urbanismo.");
      return;
    }

    setProtocolActionBusy("bulk-dispatch");
    setProtocolActionStatus("");

    try {
      for (const process of selected) {
        await dispatchProcess({
          processId: process.id,
          actor: session.name,
          from: "Setor de Protocolo",
          to: URBAN_ANALYSIS_DEPARTMENT,
          subject: "Encaminhamento para análise urbanística",
          dueDate: "",
          visibility: "misto",
          priority: "media",
        });
      }
      setSelectedProcessIds(new Set());
      setProtocolActionStatus(
        `${selected.length} processo(s) despachado(s) para ${URBAN_ANALYSIS_DEPARTMENT}.`,
      );
    } catch (error) {
      setProtocolActionStatus(
        error instanceof Error
          ? `Não foi possível concluir o despacho em lote: ${error.message}`
          : "Não foi possível concluir o despacho em lote.",
      );
    } finally {
      setProtocolActionBusy("");
    }
  };

  const renderQueueList = (
    items: ProcessRecord[],
    emptyMessage = "Nenhum protocolo disponível nesta seção.",
    options?: { includeFinished?: boolean },
  ) => {
    const normalizedQuery = processListQuery.trim().toLocaleLowerCase("pt-BR");
    const visibleItems = items.filter((process) => {
      if (!options?.includeFinished && finishedProcessIds.has(process.id)) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        process.protocol,
        process.externalProtocol,
        process.title,
        formatOfficialProcessTitle({ title: process.title, type: process.type }),
        process.ownerName,
        process.technicalLead,
        process.address,
        process.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return haystack.includes(normalizedQuery);
    });

    return (
      <div className="space-y-3">
        <div className="sticky top-[72px] z-20 rounded-[20px] border border-slate-200 bg-white/95 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.07)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={processListQuery}
                onChange={(event) => setProcessListQuery(event.target.value)}
                placeholder="Pesquisar nos processos do Protocolo por nome, número, proprietário, responsável ou endereço"
                className="h-11 rounded-xl border-slate-200 pl-11"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedProcessIds.size > 0 ? (
                <>
                  <span className="inline-flex h-10 items-center rounded-xl bg-slate-100 px-3 text-sm font-medium text-slate-700">
                    {selectedProcessIds.size} selecionado(s)
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl"
                    disabled={protocolActionBusy === "bulk-dispatch"}
                    onClick={() => void dispatchSelectedToUrbanism(visibleItems)}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {protocolActionBusy === "bulk-dispatch" ? "Despachando..." : "Despachar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={finishSelectedInMyList}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Finalizar na minha lista
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            “Finalizar na minha lista” não apaga o processo nem documentos; apenas o remove das filas operacionais deste usuário. Em “Todos os protocolos”, ele continua disponível para rastreabilidade.
          </p>
        </div>

        {protocolActionStatus ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            {protocolActionStatus}
          </div>
        ) : null}

        {visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            {normalizedQuery ? "Nenhum processo encontrado para esta pesquisa." : emptyMessage}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.07)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_44px_rgba(0,0,0,0.24)]">
            {visibleItems.map((process, index) => {
              const guides = getProcessPaymentGuides(process, tenantSettings);
              const protocolGuide = guides.find((guide) => guide.kind === "protocolo");
              const missingRequired = getMissingRequiredDocuments(process);
              const isUrgent = process.sla.breached || process.sla.hoursRemaining <= 8;
              const isDeskFlow = deskProtocolIds.has(process.id);
              const externalSubmission = isExternalProfessionalSubmission(process);
              const creator =
                (process.createdByProfileId ? userById.get(process.createdByProfileId) : undefined) ??
                (process.createdBy ? userById.get(process.createdBy) : undefined);
              const expanded = expandedProcessIds.has(process.id);
              const selected = selectedProcessIds.has(process.id);
              const ownedByProtocol = isProcessOwnedBySessionDepartment(session, process);

              return (
                <div
                  key={process.id}
                  data-process-premium-card="true"
                  className={`${index > 0 ? "border-t border-slate-200 dark:border-slate-700" : ""} ${selected ? "bg-sky-50/70 dark:bg-sky-950/30" : "bg-white dark:bg-slate-900"} transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/70`}
                >
                  <div className="flex min-h-[68px] items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleProcessSelection(process.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="h-4 w-4 shrink-0 rounded border-slate-300"
                      aria-label={`Selecionar ${formatOfficialProcessNumber(process.protocol)}`}
                    />

                    <button
                      type="button"
                      onClick={() => toggleProcessExpanded(process.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-950 dark:text-white">
                            {formatOfficialProcessNumber(process.protocol)}
                          </span>
                          <Badge variant="outline" className={statusTone(process.status)}>
                            {statusLabel(process.status)}
                          </Badge>
                          {externalSubmission ? (
                            <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">
                              <Globe2 className="mr-1 h-3.5 w-3.5" />
                              Profissional externo
                            </Badge>
                          ) : null}
                          {isUrgent ? (
                            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                              SLA crítico
                            </Badge>
                          ) : null}
                          {missingRequired > 0 ? (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              {missingRequired} doc.
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium text-slate-700">
                          {formatOfficialProcessTitle({ title: process.title, type: process.type })}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {process.ownerName} • {process.address} • {externalSubmission ? "Online — profissional externo" : isDeskFlow ? "Balcão" : "Online"}
                          {externalSubmission && creator?.name ? ` • Enviado por ${creator.name}` : ""}
                        </span>
                      </span>
                    </button>

                    <Button asChild className="h-9 shrink-0 rounded-xl bg-[linear-gradient(135deg,#0b5e93_0%,#0f78b8_100%)] px-4 font-semibold !text-white shadow-[0_8px_20px_rgba(14,116,181,0.22)] hover:brightness-105 [&_*]:!text-white">
                      <Link to={buildProcessPath(process)}>Abrir protocolo</Link>
                    </Button>
                  </div>

                  {expanded ? (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 dark:border-slate-700 dark:bg-slate-950/35 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <UserAvatar
                            name={process.ownerName}
                            imageUrl={getUserProfile(process.createdBy)?.avatarUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{process.ownerName}</p>
                            <p className="truncate text-sm text-slate-500">{process.address}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <MarkerSelector
                            processId={process.id}
                            tags={process.tags}
                            actor={session.name}
                            subjectLabel="processo"
                            triggerClassName="h-8 rounded-full text-[11px]"
                          />
                          {!ownedByProtocol ? (
                            <span className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] font-medium text-slate-500">
                              Acompanhamento
                            </span>
                          ) : null}
                          {ownedByProtocol && process.status === "pagamento_confirmado" ? (
                            <Button
                              type="button"
                              className="h-9 rounded-xl bg-sky-700 text-white hover:bg-sky-800"
                              disabled={protocolActionBusy === `dispatch-${process.id}`}
                              onClick={() => void handleDispatchToUrbanism(process)}
                            >
                              {protocolActionBusy === `dispatch-${process.id}` ? "Despachando..." : "Despachar para Urbanismo"}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="sig-responsive-data-grid mt-4">
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Abertura</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{getOpeningDate(process)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Guia principal</p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{protocolGuide?.code || "Não emitida"}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatCurrency(protocolGuide?.amount || 0)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Pagamento</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {protocolGuide?.status === "compensada" ? "Confirmado" : "Pendente"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Responsável</p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{process.technicalLead || "Não informado"}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Fluxo atual</p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {process.processControl?.currentFolder || process.dispatches[0]?.to || "Fluxo interno"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{process.sla.hoursRemaining}h para o SLA</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const handleTriageStatus = async (
    process: ProcessRecord,
    status: "em_triagem" | "concluido",
  ) => {
    const pendingReview = getPendingTriageDocuments(process);
    if (status === "concluido" && pendingReview > 0) {
      setProtocolActionStatus(
        `A triagem não pode ser concluída: ${pendingReview} documento(s) obrigatório(s) ainda precisam ser enviados ou aprovados.`,
      );
      return;
    }

    const busyKey = `triage-${status}-${process.id}`;
    setProtocolActionBusy(busyKey);
    setProtocolActionStatus("");

    try {
      await updateProcessTriage({
        processId: process.id,
        status,
        actor: session.name,
        notes:
          status === "em_triagem"
            ? "Conferência documental iniciada pelo atendimento administrativo."
            : "Documentação obrigatória conferida e triagem concluída.",
      });
      setProtocolActionStatus(
        status === "em_triagem"
          ? `Triagem iniciada para ${formatOfficialProcessNumber(process.protocol)}.`
          : `Triagem concluída. Como a guia inicial já está compensada, o processo está pronto para despacho ao Urbanismo.`,
      );
    } catch (error) {
      setProtocolActionStatus(
        error instanceof Error
          ? `Não foi possível atualizar a triagem: ${error.message}`
          : "Não foi possível atualizar a triagem no banco oficial.",
      );
    } finally {
      setProtocolActionBusy("");
    }
  };

  const handleConfirmPreprotocolPayment = async (
    item: PendingPreprotocolPayment,
  ) => {
    const busyKey = `preprotocol-payment-${item.processId}`;
    setProtocolActionBusy(busyKey);
    setProtocolActionStatus("");

    try {
      const result = await confirmRemotePreprotocolPayment(item.processId);
      await Promise.allSettled([
        refreshRemoteStore(),
        refreshPreprotocolPayments(),
      ]);

      setProtocolActionStatus(
        `Pagamento confirmado. O pré-protocolo ${item.preProtocolNumber} virou o processo ${formatOfficialProcessNumber(
          result.protocol_number,
        )} e entrou na Triagem de Protocolo.`,
      );
    } catch (error) {
      setProtocolActionStatus(
        error instanceof Error
          ? `Não foi possível confirmar o pagamento do pré-protocolo: ${error.message}`
          : "Não foi possível confirmar o pagamento do pré-protocolo.",
      );
    } finally {
      setProtocolActionBusy("");
    }
  };

  const handleConfirmProtocolPayment = async (process: ProcessRecord) => {
    const protocolGuide = getProcessPaymentGuides(process, tenantSettings).find(
      (guide) => guide.kind === "protocolo",
    );

    if (!protocolGuide || protocolGuide.status !== "pendente") {
      setProtocolActionStatus("A guia de protocolo já está confirmada ou não está disponível para baixa.");
      return;
    }

    if (process.triage.status !== "concluido") {
      setProtocolActionStatus("Conclua a triagem documental antes de confirmar o pagamento do protocolo.");
      return;
    }

    setProtocolActionBusy(`payment-${process.id}`);
    setProtocolActionStatus("");

    try {
      await markGuideAsPaid(process.id, session.name, "protocolo");
      setProtocolActionStatus(
        "Pagamento confirmado. O processo continua no Protocolo e está pronto para despacho ao Urbanismo.",
      );
    } catch (error) {
      setProtocolActionStatus(
        error instanceof Error
          ? `Não foi possível confirmar o pagamento: ${error.message}`
          : "Não foi possível confirmar o pagamento no banco oficial.",
      );
    } finally {
      setProtocolActionBusy("");
    }
  };

  const handleDispatchToUrbanism = async (process: ProcessRecord) => {
    if (process.status !== "pagamento_confirmado") {
      setProtocolActionStatus("Confirme primeiro a guia inicial antes de despachar para o Urbanismo.");
      return;
    }

    const busyKey = `dispatch-${process.id}`;
    setProtocolActionBusy(busyKey);
    setProtocolActionStatus("");

    try {
      await dispatchProcess({
        processId: process.id,
        actor: session.name,
        from: "Setor de Protocolo",
        to: URBAN_ANALYSIS_DEPARTMENT,
        subject: "Encaminhamento para análise urbanística",
        dueDate: "",
        visibility: "misto",
        priority: "media",
      });
      setProtocolActionStatus(
        `${formatOfficialProcessNumber(process.protocol)} despachado para ${URBAN_ANALYSIS_DEPARTMENT}.`,
      );
    } catch (error) {
      setProtocolActionStatus(
        error instanceof Error
          ? `Não foi possível despachar o processo: ${error.message}`
          : "Não foi possível despachar o processo para o Urbanismo.",
      );
    } finally {
      setProtocolActionBusy("");
    }
  };

  const renderSearchPanel = ({
    title,
    description,
    hint,
  }: {
    title: string;
    description: string;
    hint: string;
  }) => (
    <SectionCard title={title} description={description}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="sig-search-icon pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={protocolQuery}
              onChange={(event) => setProtocolQuery(event.target.value)}
              placeholder="Buscar por protocolo, protocolo externo ou guia"
              className="h-12 rounded-2xl border-slate-200 pl-11"
            />
          </div>

          {matchedProcess ? (
            <div className="flex flex-col gap-3 lg:flex-row">
              {getProcessPaymentGuides(matchedProcess, tenantSettings).find(
                (guide) => guide.kind === "protocolo",
              )?.status === "pendente" ? (
                <Button
                  type="button"
                  className="rounded-full bg-emerald-700 px-5 text-white hover:bg-emerald-800"
                  disabled={protocolActionBusy === `payment-${matchedProcess.id}`}
                  onClick={() => void handleConfirmProtocolPayment(matchedProcess)}
                >
                  {protocolActionBusy === `payment-${matchedProcess.id}`
                    ? "Confirmando..."
                    : "Confirmar pagamento recebido"}
                </Button>
              ) : null}

              {getProcessPaymentGuides(matchedProcess, tenantSettings).find(
                (guide) => guide.kind === "protocolo",
              )?.status === "compensada" ? (
                <div className="inline-flex min-h-10 items-center rounded-full border border-sky-200 bg-sky-50 px-4 text-sm font-medium text-sky-800">
                  Encaminhado automaticamente para {URBAN_ANALYSIS_DEPARTMENT}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {protocolActionStatus ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            /não foi|ainda não|bloqueado/i.test(protocolActionStatus)
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            {protocolActionStatus}
          </div>
        ) : null}

        {matchedProcess ? (
          <div className="sig-dark-panel rounded-2xl border border-slate-200 p-5">
            <div className="sig-responsive-data-grid">
              <div>
                <p className="sig-label">Protocolo</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(matchedProcess.protocol)}</p>
              </div>
              <div>
                <p className="sig-label">Guia principal</p>
                <p className="mt-2 sig-fit-title text-sm font-semibold text-slate-950">
                  {getProcessPaymentGuides(matchedProcess, tenantSettings)[0]?.code}
                </p>
              </div>
              <div>
                <p className="sig-label">Situação</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {getProcessPaymentGuides(matchedProcess, tenantSettings)[0]?.status === "compensada"
                    ? "Pagamento confirmado"
                    : "Pagamento pendente"}
                </p>
              </div>
              <div>
                <p className="sig-label">Valor</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">
                  {formatCurrency(getProcessPaymentGuides(matchedProcess, tenantSettings)[0]?.amount || 0)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {getProcessPaymentGuides(matchedProcess, tenantSettings).map((guide) => (
                <div key={guide.kind} className="sig-dark-panel rounded-2xl border border-slate-200 p-4">
                  <p className="sig-fit-title text-sm font-semibold text-slate-950" title={guide.label}>
                    {guide.label}
                  </p>
                  <p className="mt-2 sig-fit-copy text-sm text-slate-700" title={guide.code}>
                    {guide.code}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-950">{formatCurrency(guide.amount)}</p>
                  <p className="mt-1 text-xs text-slate-500">Vencimento {guide.dueDate}</p>
                  <p
                    className={`mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      guide.status === "compensada" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {guide.status === "compensada" ? "Confirmado" : "Pendente"}
                  </p>
                </div>
              ))}
            </div>


          </div>
        ) : protocolQuery.trim() ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
            Nenhum protocolo localizado com este número.
          </div>
        ) : (
          <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            {hint}
          </div>
        )}
      </div>
    </SectionCard>
  );

  return (
    <PortalFrame eyebrow="SETOR DE PROTOCOLO" title="Triagem municipal, atendimento e fluxo inicial">
      <PageShell>
        <PageHeader
          eyebrow="Operação de protocolo"
          title="Recepção, conferência documental e despacho inicial"
          description="Receba pedidos, faça a triagem documental, protocole atendimentos e confirme a guia inicial antes do envio ao Urbanismo."
          icon={ClipboardList}
          actions={
            <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
              <Link to="/prefeitura/protocolos/novo">
                <FilePlus2 className="mr-2 h-4 w-4 text-sky-200" />
                Protocolar no balcão
              </Link>
            </Button>
          }
        />

        <InternalTabs
          items={navItems as unknown as Array<{ value: string; label: string; helper?: string }>}
          value={section}
          onChange={(value) => setSection(value as ProtocolSection)}
        />

        {section === "visao-geral" ? (
          <>
            <PageStatsRow className="xl:grid-cols-4">
              <StatCard label="Protocolos acompanhados" value={String(processes.length)} description="Rastreabilidade dos processos originados no setor" icon={ClipboardList} tone="blue" />
              <StatCard label="Na fila do Protocolo" value={String(protocolQueueProcesses.length)} description="Aguardando atuação do setor" icon={Layers3} tone="amber" />
              <StatCard label="SLA crítico" value={String(urgentProtocols.length)} description="Prazo curto ou vencido" icon={Clock3} tone="rose" />
              <StatCard label="Triados" value={String(triagedProtocols.length)} description="Conferência documental concluída" icon={CheckCircle2} tone="emerald" />
            </PageStatsRow>

            <PageMainGrid>
              <PageMainContent>
                <TableCard
                  title="Prioridades agora"
                  description="Somente os protocolos que merecem atenção primeiro. A operação completa continua na Fila de triagem."
                  icon={Layers3}
                  actions={
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => setSection("fila")}>
                      Ver fila completa
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    {queueItems.slice(0, 4).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                        Nenhum protocolo aguardando atuação no momento.
                      </div>
                    ) : (
                      queueItems.slice(0, 4).map((process) => {
                        const missing = getMissingRequiredDocuments(process);
                        const urgent = process.sla.breached || process.sla.hoursRemaining <= 8;
                        return (
                          <div key={process.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="sig-fit-title text-sm font-semibold text-slate-950">
                                  {formatOfficialProcessNumber(process.protocol)}
                                </p>
                                <Badge variant="outline" className={statusTone(process.status)}>
                                  {statusLabel(process.status)}
                                </Badge>
                                {urgent ? (
                                  <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 text-rose-700">
                                    SLA crítico
                                  </Badge>
                                ) : null}
                                {missing > 0 ? (
                                  <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                                    {missing} doc. pendente(s)
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                                {formatOfficialProcessTitle({ title: process.title, type: process.type })}
                              </p>
                            </div>
                            <Button asChild variant="outline" className="shrink-0 rounded-full">
                              <Link to={buildProcessPath(process)}>Abrir protocolo</Link>
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </TableCard>
              </PageMainContent>

              <PageSideContent>
                <SectionCard title="Atenção imediata" description="Leitura objetiva do que pode travar o setor.">
                  <div className="space-y-3">
                    <AlertCard
                      title="Prazo crítico"
                      description={urgentProtocols.length > 0 ? `${urgentProtocols.length} protocolo(s) precisam de reação imediata.` : "Nenhum prazo crítico agora."}
                      tone={urgentProtocols.length > 0 ? "danger" : "success"}
                      icon={Clock3}
                    />
                    <AlertCard
                      title="Documentação"
                      description={pendingDocuments.length > 0 ? `${pendingDocuments.length} entrada(s) aguardam documento obrigatório.` : "Documentação regular na fila atual."}
                      tone={pendingDocuments.length > 0 ? "warning" : "success"}
                      icon={FileWarning}
                    />
                  </div>
                </SectionCard>

                <SectionCard title="Ações rápidas" description="Atalhos para as tarefas mais usadas.">
                  <div className="grid gap-2">
                    <Button asChild className="sig-force-dark-action h-11 justify-start rounded-2xl bg-slate-950 !text-white hover:bg-slate-900">
                      <Link to="/prefeitura/protocolos/novo">
                        <FilePlus2 className="mr-2 h-4 w-4" />
                        Novo protocolo
                      </Link>
                    </Button>
                    <Button type="button" variant="outline" className="h-11 justify-start rounded-2xl" onClick={() => setSection("fila")}>
                      <Layers3 className="mr-2 h-4 w-4" />
                      Abrir fila de triagem
                    </Button>
                    <Button type="button" variant="outline" className="h-11 justify-start rounded-2xl" onClick={() => setSection("documentos")}>
                      <FileWarning className="mr-2 h-4 w-4" />
                      Ver documentos pendentes
                    </Button>
                    <Button type="button" variant="outline" className="h-11 justify-start rounded-2xl" onClick={() => setSection("pagamentos")}>
                      <CircleDollarSign className="mr-2 h-4 w-4" />
                      Conferir pagamentos do protocolo
                    </Button>
                  </div>
                </SectionCard>
              </PageSideContent>
            </PageMainGrid>
          </>
        ) : null}

        {section === "todos" ? (
          <TableCard
            title={`Todos os protocolos recebidos (${processes.length})`}
            description="Livro de registro permanente da Prefeitura: entradas presenciais e digitais continuam visíveis mesmo após seguirem para Urbanismo, Financeiro ou outra unidade."
            icon={ClipboardList}
          >
            <div
              className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4"
              role="group"
              aria-label="Marcadores de protocolos"
            >
              <button
                type="button"
                onClick={() => setMarkerFilter("todos")}
                aria-pressed={markerFilter === "todos"}
                data-protocol-marker-active={markerFilter === "todos" ? "true" : "false"}
                className={`sig-protocol-marker inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold transition-all duration-200 ${
                  markerFilter === "todos"
                    ? "border-slate-950 bg-slate-950 text-white shadow-[0_7px_16px_rgba(15,23,42,0.22)]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {markerFilter === "todos" ? (
                  <CheckCircle2 className="sig-protocol-marker-icon h-3.5 w-3.5 shrink-0" />
                ) : null}
                <span className="sig-protocol-marker-label">Todos</span>
                <span className="sig-protocol-marker-count rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                  {processes.length}
                </span>
              </button>

              {protocolMarkerLinks.map((marker) => {
                const markerActive = markerFilter === marker.id;

                return (
                  <button
                    key={marker.id}
                    type="button"
                    onClick={() => setMarkerFilter(marker.id)}
                    aria-pressed={markerActive}
                    data-protocol-marker-active={markerActive ? "true" : "false"}
                    className={`sig-protocol-marker inline-flex h-8 max-w-[210px] items-center gap-2 rounded-full border px-3 text-[11px] font-semibold transition-all duration-200 hover:-translate-y-px ${
                      markerActive
                        ? "border-slate-950 bg-slate-950 text-white shadow-[0_7px_16px_rgba(15,23,42,0.22)]"
                        : ""
                    }`}
                    style={
                      markerActive
                        ? undefined
                        : {
                            borderColor: `${marker.color}55`,
                            backgroundColor: `${marker.color}0f`,
                            color: marker.color,
                          }
                    }
                    title={marker.label}
                  >
                    {markerActive ? (
                      <CheckCircle2 className="sig-protocol-marker-icon h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: marker.color }}
                      />
                    )}
                    <span className="sig-protocol-marker-label truncate">{marker.label}</span>
                    <span className="sig-protocol-marker-count rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                      {marker.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {renderQueueList(
              [...markerFilteredProcesses].sort((a, b) => getOpeningDate(b).localeCompare(getOpeningDate(a))),
              markerFilter === "todos"
                ? "Nenhum protocolo recebido foi localizado para esta Prefeitura."
                : "Nenhum protocolo possui este marcador.",
              { includeFinished: true },
            )}
          </TableCard>
        ) : null}

        {section === "fila" ? (
          <TableCard title="Fila de triagem" description="Leitura operacional completa com prioridade, prazo, responsável e avanço do protocolo." icon={Layers3}>
            {renderQueueList(queueItems, "Nenhum protocolo em triagem no momento.")}
          </TableCard>
        ) : null}

        {section === "entradas" ? (
          <>
            <PageStatsRow className="xl:grid-cols-3">
              <StatCard
                label="Balcão"
                value={String(deskProtocols.length)}
                description="Entradas com atendimento presencial"
                icon={Store}
                tone="blue"
              />
              <StatCard
                label="Online"
                value={String(onlineProtocolItems.length)}
                description="Recepção digital disponível"
                icon={Globe2}
                tone="emerald"
              />
              <StatCard
                label="Novos registros"
                value={String(newProtocols.length)}
                description="Protocolos ainda na etapa inicial"
                icon={ClipboardList}
                tone="amber"
              />
            </PageStatsRow>

            <TableCard
              title="Entradas por canal"
              description="Recepção municipal organizada por origem, com leitura clara entre atendimento presencial e entrada digital."
              icon={ClipboardList}
            >
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="sig-dark-panel rounded-3xl border border-slate-200 p-5">
                  <div className="flex items-start gap-4">
                    <div className="sig-dark-panel flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-sky-200">
                      <Store className="h-4 w-4 text-sky-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">Atendimento balcão</p>
                          <p className="mt-1 text-sm text-slate-500">Protocolos com apoio presencial do setor.</p>
                        </div>
                        <span className="sig-theme-chip shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                          {deskProtocols.length} entrada{deskProtocols.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5">
                    {renderQueueList(deskProtocols.slice(0, 6), "Nenhuma entrada presencial disponível.")}
                  </div>
                </div>

                <div className="sig-dark-panel rounded-3xl border border-slate-200 p-5">
                  <div className="flex items-start gap-4">
                    <div className="sig-dark-panel flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-sky-200">
                      <Globe2 className="h-4 w-4 text-sky-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">Atendimento online</p>
                          <p className="mt-1 text-sm text-slate-500">Entradas digitais prontas para conferência.</p>
                        </div>
                        <span className="sig-theme-chip shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                          {onlineProtocolItems.length} entrada{onlineProtocolItems.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5">
                    {renderQueueList(onlineProtocolItems.slice(0, 6), "Nenhuma entrada digital disponível.", { includeFinished: true })}
                  </div>
                </div>
              </div>
            </TableCard>

            <SectionCard title="Leitura da recepção" description="Distribuição rápida das entradas atuais e situação operacional do setor.">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="sig-dark-panel rounded-2xl border border-slate-200 p-5">
                  <p className="sig-label">Balcão</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{deskProtocols.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Fluxo com atendimento assistido.</p>
                </div>
                <div className="sig-dark-panel rounded-2xl border border-slate-200 p-5">
                  <p className="sig-label">Online</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{onlineProtocolItems.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Recepção digital do sistema.</p>
                </div>
                <div className="sig-dark-panel rounded-2xl border border-slate-200 p-5">
                  <p className="sig-label">Novos registros</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{newProtocols.length}</p>
                  <p className="mt-1 text-sm text-slate-500">Protocolos ainda na etapa inicial.</p>
                </div>
              </div>
            </SectionCard>
          </>
        ) : null}

        {section === "documentos" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableCard title="Documentos pendentes" description="Entradas bloqueadas por ausência de arquivo obrigatório ou necessidade de regularização." icon={FileWarning}>
                {renderQueueList(incompleteProtocols, "Nenhum protocolo com pendência documental no momento.")}
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Situação da regularização" description="Leitura curta das principais travas documentais.">
                <div className="space-y-3">
                  <AlertCard
                    title="Documentação obrigatória"
                    description={`${pendingDocuments.length} processo(s) aguardam envio ou conferência de documento obrigatório.`}
                    tone={pendingDocuments.length > 0 ? "warning" : "success"}
                    icon={FileWarning}
                  />
                  <AlertCard
                    title="SLA sob atenção"
                    description={`${urgentProtocols.filter((item) => getMissingRequiredDocuments(item) > 0).length} protocolo(s) com pendência documental e prazo curto.`}
                    tone={urgentProtocols.some((item) => getMissingRequiredDocuments(item) > 0) ? "danger" : "default"}
                    icon={Clock3}
                  />
                  <AlertCard
                    title="Comunicação"
                    description={
                      incompleteProtocols.length > 0
                        ? "Há protocolos que exigem retorno institucional ao requerente."
                        : "Nenhuma comunicação pendente nesta etapa."
                    }
                    tone={incompleteProtocols.length > 0 ? "warning" : "success"}
                    icon={AlertTriangle}
                  />
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {section === "pagamentos" ? (
          <PageMainGrid>
            <PageMainContent>
              {canImportMunicipalGuide ? <SectionCard
                title="Recebimento direto de guia oficial municipal"
                description="A guia continua sendo emitida no sistema escolhido pela Prefeitura. Depois, importe o PDF oficial diretamente no processo e comunique o profissional pelo SIGAPRO."
              >
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label htmlFor="govbr-protocol-search" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Localizar processo oficial</label>
                      <Input id="govbr-protocol-search" className="mt-2 h-11" value={govbrProtocolQuery} onChange={(event) => setGovbrProtocolQuery(event.target.value)}
                        placeholder="Número do processo ou proprietário" />
                    </div>
                    <div>
                      <label htmlFor="govbr-protocol-select" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Processo para receber o PDF</label>
                      <select id="govbr-protocol-select" className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                        value={govbrProtocolId} onChange={(event) => setGovbrProtocolId(event.target.value)}>
                        <option value="">Selecione o processo</option>
                        {govbrEligibleProcesses.filter((item) => {
                          const q = govbrProtocolQuery.trim().toLocaleLowerCase("pt-BR");
                          return !q || `${item.protocol} ${item.ownerName} ${item.externalProtocol}`.toLocaleLowerCase("pt-BR").includes(q);
                        }).slice(0, 30).map((item) => (
                          <option key={item.id} value={item.id}>{item.protocol} • {item.ownerName}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {govbrEligibleProcesses.find((item) => item.id === govbrProtocolId) ? (() => {
                    const selected = govbrEligibleProcesses.find((item) => item.id === govbrProtocolId)!;
                    return <GovbrArGuideBridge
                      scope="protocolo"
                      supplierCode={collectionConfig.supplier_code || ""}
                      supplierName={collectionConfig.supplier_name || "Sistema da Prefeitura"}
                      process={selected}
                      municipalityId={effectiveScopeId || selected.tenantId}
                      actorId={session.id}
                      actorName={session.name}
                      canImport={session.role !== "prefeitura_admin" && session.id !== "unknown"}
                      existingGuides={getProcessPaymentGuides(selected, tenantSettings)}
                      onAppend={async (document, reference, guideKind) => {
                        const result = await attachMunicipalCollectionGuide({
                          municipalityId: effectiveScopeId || selected.tenantId,
                          processId: selected.id, reference, guideKind, document,
                        });
                        await refreshRemoteStore();
                        return result;
                      }}
                      onNotify={(message) => sendProcessMessage({
                        processId: selected.id,
                        senderName: session.name,
                        senderRole: session.role,
                        audience: "externo",
                        message,
                      })}
                    />;
                  })() : (
                    <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-slate-700">
                      Selecione um processo ou pré-protocolo já registrado no SIGAPRO. Importar a guia do GOVBR não confirma pagamento, não atribui número oficial e não altera a etapa da triagem.
                    </p>
                  )}
                </div>
              </SectionCard> : null}
              <TableCard
                title="Pré-protocolos aguardando pagamento"
                description="Antes da compensação existe somente o pré-protocolo e a guia inicial. Ao confirmar o pagamento, o SIGAPRO atribui o número oficial de forma atômica e abre o processo na Triagem de Protocolo."
                icon={CircleDollarSign}
              >
                <div className="space-y-4">
                  {preprotocolPaymentsError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                      {preprotocolPaymentsError}
                    </div>
                  ) : null}

                  {preprotocolPaymentsLoading &&
                  pendingPreprotocolPayments.length === 0 &&
                  pendingProtocolPayments.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                      Atualizando a fila de pagamentos...
                    </div>
                  ) : null}

                  {pendingPreprotocolPayments.map((item) => (
                    <div
                      key={item.processId}
                      className="rounded-[22px] border border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#f5fbff_100%)] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.07)] dark:border-sky-500/25 dark:bg-[linear-gradient(180deg,#12273a_0%,#0d1d2c_100%)]"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {item.preProtocolNumber}
                            </p>
                            <Badge
                              variant="outline"
                              className="rounded-full border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                            >
                              Pré-protocolo · pagamento pendente
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {item.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Enviado por {item.submitterName}. Ainda não existe número de processo municipal.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                            <span>
                              Guia:{" "}
                              <strong className="text-slate-900 dark:text-white">
                                {item.guideNumber || "Não emitida"}
                              </strong>
                            </span>
                            <span>
                              Valor:{" "}
                              <strong className="text-slate-900 dark:text-white">
                                {formatCurrency(item.amount)}
                              </strong>
                            </span>
                            <span>
                              Vencimento:{" "}
                              <strong className="text-slate-900 dark:text-white">
                                {item.dueDate
                                  ? new Date(item.dueDate).toLocaleDateString("pt-BR")
                                  : "-"}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          className="rounded-full bg-emerald-700 px-5 font-bold text-white hover:bg-emerald-800"
                          disabled={
                            protocolActionBusy ===
                            `preprotocol-payment-${item.processId}`
                          }
                          onClick={() => void handleConfirmPreprotocolPayment(item)}
                        >
                          {protocolActionBusy ===
                          `preprotocol-payment-${item.processId}`
                            ? "Confirmando..."
                            : "Confirmar pagamento e criar processo"}
                        </Button>
                      </div>
                    </div>
                  ))}

                  {pendingProtocolPayments.length > 0 ? (
                    <div className="pt-2">
                      <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        Registros anteriores à nova regra
                      </p>
                      <div className="space-y-3">
                        {pendingProtocolPayments.map((process) => {
                          const guide = getProcessPaymentGuides(
                            process,
                            tenantSettings,
                          ).find((item) => item.kind === "protocolo");

                          return (
                            <div
                              key={process.id}
                              className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-950 dark:text-white">
                                    {formatOfficialProcessNumber(process.protocol)}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                    Fluxo legado preservado · Guia {guide?.code || "não emitida"} ·{" "}
                                    {formatCurrency(guide?.amount || 0)}
                                  </p>
                                </div>
                                {process.triage.status === "concluido" ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-full"
                                    disabled={
                                      protocolActionBusy === `payment-${process.id}`
                                    }
                                    onClick={() =>
                                      void handleConfirmProtocolPayment(process)
                                    }
                                  >
                                    {protocolActionBusy === `payment-${process.id}`
                                      ? "Confirmando..."
                                      : "Confirmar fluxo legado"}
                                  </Button>
                                ) : (
                                  <Button asChild variant="outline" className="rounded-full">
                                    <Link to={buildProcessPath(process, "documentos")}>
                                      Concluir triagem
                                    </Link>
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {!preprotocolPaymentsLoading &&
                  pendingPreprotocolPayments.length === 0 &&
                  pendingProtocolPayments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                      Nenhum pré-protocolo aguardando confirmação de pagamento.
                    </div>
                  ) : null}
                </div>
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard
                title="Regra de oficialização"
                description="O número do processo nasce somente após a compensação da guia inicial."
              >
                <div className="space-y-3">
                  <AlertCard
                    title="Aguardando pagamento"
                    description={`${
                      pendingPreprotocolPayments.length +
                      pendingProtocolPayments.length
                    } guia(s) inicial(is) aguardam confirmação.`}
                    tone={
                      pendingPreprotocolPayments.length +
                        pendingProtocolPayments.length >
                      0
                        ? "warning"
                        : "success"
                    }
                    icon={CircleDollarSign}
                  />
                  <AlertCard
                    title="Processos oficializados"
                    description={`${confirmedProtocolPayments.length} processo(s) possuem pagamento inicial compensado.`}
                    tone="success"
                    icon={CheckCircle2}
                  />
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                    A confirmação é transacional: o banco serializa a numeração por Prefeitura, ano e prefixo. Depois da baixa, o processo entra em Triagem de Protocolo; somente após a conferência documental fica pronto para despacho ao Urbanismo.
                  </div>
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {section === "balcao" ? (
          <PageMainGrid>
            <PageMainContent>
              {renderSearchPanel({
                title: "Atendimento de balcão",
                description: "Registre guias, confirme pagamentos e despache protocolos com apoio presencial do setor.",
                hint: "Busque um protocolo para registrar guia manual, confirmar pagamento ou despachar para a fila técnica.",
              })}
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Fila do balcão" description="Protocolos com passagem operacional pelo atendimento presencial.">
                {renderQueueList(deskProtocols.slice(0, 4), "Nenhum protocolo em atendimento presencial.")}
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {section === "online" ? (
          <PageMainGrid>
            <PageMainContent>
              {renderSearchPanel({
                title: "Atendimento online",
                description: "Conduza a entrada digital, acompanhe as guias e avance os protocolos recebidos por canal eletrônico.",
                hint: "Busque um protocolo digital para validar documentos, confirmar pagamento ou encaminhar a próxima etapa.",
              })}
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Fila online" description="Entradas digitais sob responsabilidade do setor.">
                {renderQueueList(onlineProtocolItems.slice(0, 4), "Nenhum protocolo digital em atendimento.", { includeFinished: true })}
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {section === "historico" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableCard title="Histórico operacional" description="Últimos registros de recepção, conferência, despacho e andamento do protocolo." icon={ClipboardList}>
                <div className="space-y-3">
                  {latestActivity.map((entry) => (
                    <div key={entry.id} className="sig-dark-panel rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(entry.protocol)}</p>
                          <p className="mt-1 text-sm text-slate-800">{entry.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{entry.detail}</p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">{entry.at}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Atalhos do protocolo" description="Ações recorrentes da rotina municipal.">
                <div className="space-y-3">
                  <Button asChild variant="outline" className="sig-dark-action-btn h-11 w-full justify-start rounded-2xl text-slate-50">
                    <Link to="/prefeitura/protocolos/novo">
                      <FilePlus2 className="mr-2 h-4 w-4 text-sky-200" />
                      Novo protocolo assistido
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="sig-dark-action-btn h-11 w-full justify-start rounded-2xl text-slate-50">
                    <Link to="/prefeitura">
                      <Building2 className="mr-2 h-4 w-4 text-sky-200" />
                      Voltar ao painel municipal
                    </Link>
                  </Button>
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}
      </PageShell>
    </PortalFrame>
  );
}
