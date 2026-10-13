import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileWarning,
  Globe2,
  Layers3,
  Search,
  Store,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { SectionCard } from "@/components/platform/SectionCard";
import { StatCard } from "@/components/platform/StatCard";
import { TableCard } from "@/components/platform/TableCard";
import { UserAvatar } from "@/components/platform/UserAvatar";
import {
  formatCurrency,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getProcessPaymentGuides,
  parseMarker,
  statusLabel,
  statusTone,
  type ProcessRecord,
  URBAN_ANALYSIS_DEPARTMENT,
} from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";

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
    getInstitutionSettings,
    markGuideAsPaid,
    updateProcessTriage,
    dispatchProcess,
    getUserProfile,
  } = usePlatformData();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;

  // O Protocolo funciona como cartório/recepção do Município: mantém consulta ao
  // registro completo, mesmo depois que o processo foi despachado para outro setor.
  const processes = useMemo(
    () =>
      allProcesses.filter((item) => {
        const processScope = item.municipalityId || item.tenantId || null;
        return Boolean(effectiveScopeId) && processScope === effectiveScopeId;
      }),
    [allProcesses, effectiveScopeId],
  );

  const protocolQueueProcesses = useMemo(
    () =>
      processes.filter((item) => {
        const currentFolder = (item.processControl?.currentFolder || "").toLowerCase();
        const isInProtocolFolder =
          currentFolder.includes("protocolo") ||
          currentFolder.includes("triagem") ||
          currentFolder.includes("recepção") ||
          currentFolder.includes("recepcao");

        if (isInProtocolFolder) return true;

        return [
          "protocolo",
          "triagem",
          "pendencia_documental",
          "guia_emitida",
          "pagamento_pendente",
          "pagamento_confirmado",
        ].includes(item.status);
      }),
    [processes],
  );

  const tenantSettings =
    institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId ?? session.tenantId);

  const [protocolQuery, setProtocolQuery] = useState("");
  const [protocolActionStatus, setProtocolActionStatus] = useState("");
  const [protocolActionBusy, setProtocolActionBusy] = useState("");
  const [section, setSection] = useState<ProtocolSection>("visao-geral");
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
  const onlineProtocolItems = processes.filter((item) => !deskProtocolIds.has(item.id));

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
    { value: "todos", label: "Todos os protocolos", helper: "Registro completo do Município" },
    { value: "fila", label: "Fila de triagem", helper: "Operação principal do protocolo" },
    { value: "entradas", label: "Entradas", helper: "Separação por canal de recebimento" },
    { value: "documentos", label: "Documentos pendentes", helper: "Bloqueios, exigências e regularização" },
    { value: "pagamentos", label: "Pagamento do protocolo", helper: "Conferência e baixa da guia inicial" },
    { value: "balcao", label: "Atendimento balcão", helper: "Recepção presencial e apoio assistido" },
    { value: "online", label: "Atendimento online", helper: "Entrada digital e despacho inicial" },
    { value: "historico", label: "Histórico", helper: "Últimos registros e rastreabilidade" },
  ] as const;

  const renderQueueList = (
    items: ProcessRecord[],
    emptyMessage = "Nenhum protocolo disponível nesta seção.",
  ) => (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        items.map((process) => {
          const guides = getProcessPaymentGuides(process, tenantSettings);
          const protocolGuide = guides.find((guide) => guide.kind === "protocolo");
          const missingRequired = getMissingRequiredDocuments(process);
          const isUrgent = process.sla.breached || process.sla.hoursRemaining <= 8;
          const isDeskFlow = deskProtocolIds.has(process.id);

          return (
            <div key={process.id} className="sig-dark-panel rounded-2xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-[min(100%,240px)] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="sig-fit-title text-base font-semibold leading-6 text-slate-950" title={formatOfficialProcessNumber(process.protocol)}>
                      {formatOfficialProcessNumber(process.protocol)}
                    </p>
                    <Badge variant="outline" className={statusTone(process.status)}>
                      {statusLabel(process.status)}
                    </Badge>
                    <Badge variant="outline" className="sig-theme-chip rounded-full border-slate-200 bg-white text-slate-700">
                      {isDeskFlow ? "Balcão" : "Online"}
                    </Badge>
                    {process.tags?.length ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {process.tags.map((tag) => {
                          const marker = parseMarker(tag);
                          return (
                            <span
                              key={`${process.id}-${tag}`}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700"
                            >
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: marker.color }} />
                              {marker.label}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                    {isUrgent ? (
                      <Badge variant="outline" className="border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">
                        ⏱ SLA crítico
                      </Badge>
                    ) : null}
                    {missingRequired > 0 ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400">
                        ⚠ {missingRequired} documento(s)
                      </Badge>
                    ) : null}
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-slate-900" title={formatOfficialProcessTitle({ title: process.title, type: process.type })}>{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>

                  <div className="mt-3 flex min-w-0 items-center gap-2">
                    <UserAvatar
                      name={process.ownerName}
                      imageUrl={getUserProfile(process.createdBy)?.avatarUrl}
                      size="sm"
                    />
                    <p className="sig-fit-copy text-sm leading-6 text-slate-600" title={`${process.ownerName} - ${process.address}`}>
                      {process.ownerName} - {process.address}
                    </p>
                  </div>
                </div>

                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <MarkerSelector
                    processId={process.id}
                    tags={process.tags}
                    actor={session.name}
                    triggerClassName="h-9 rounded-full text-[12px]"
                  />
                  {process.triage.status === "recebido" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full rounded-full sm:w-auto"
                      disabled={protocolActionBusy === `triage-em_triagem-${process.id}`}
                      onClick={() => void handleTriageStatus(process, "em_triagem")}
                    >
                      {protocolActionBusy === `triage-em_triagem-${process.id}` ? "Iniciando..." : "Iniciar triagem"}
                    </Button>
                  ) : null}
                  {process.triage.status === "em_triagem" ? (
                    <>
                      <Button asChild variant="outline" className="h-11 w-full rounded-full sm:w-auto">
                        <Link to={`/processos/${process.id}?aba=documentos`}>Conferir documentos</Link>
                      </Button>
                      <Button
                        type="button"
                        className="h-11 w-full rounded-full bg-sky-700 text-white hover:bg-sky-800 sm:w-auto"
                        disabled={protocolActionBusy === `triage-concluido-${process.id}`}
                        onClick={() => void handleTriageStatus(process, "concluido")}
                      >
                        {protocolActionBusy === `triage-concluido-${process.id}` ? "Concluindo..." : "Concluir triagem"}
                      </Button>
                    </>
                  ) : null}
                  {protocolGuide?.status === "pendente" && process.triage.status === "concluido" ? (
                    <Button
                      type="button"
                      className="h-11 w-full rounded-full bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto"
                      disabled={protocolActionBusy === `payment-${process.id}`}
                      onClick={() => void handleConfirmProtocolPayment(process)}
                    >
                      {protocolActionBusy === `payment-${process.id}` ? "Confirmando..." : "Confirmar pagamento"}
                    </Button>
                  ) : null}
                  {process.status === "pagamento_confirmado" ? (
                    <Button
                      type="button"
                      className="h-11 w-full rounded-full bg-sky-700 text-white hover:bg-sky-800 sm:w-auto"
                      disabled={protocolActionBusy === `dispatch-${process.id}`}
                      onClick={() => void handleDispatchToUrbanism(process)}
                    >
                      {protocolActionBusy === `dispatch-${process.id}`
                        ? "Despachando..."
                        : "Despachar para Urbanismo"}
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto">
                    <Link to={`/processos/${process.id}`}>Abrir protocolo</Link>
                  </Button>
                </div>
              </div>

              <div className="sig-responsive-data-grid mt-4">
                <div className="sig-dark-panel rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="sig-label">Abertura</p>
                  <p className="sig-fit-title mt-2 text-sm font-semibold leading-6 text-slate-950" title={getOpeningDate(process)}>{getOpeningDate(process)}</p>
                  <p className="mt-1 text-xs text-slate-500">Entrada no protocolo</p>
                </div>
                <div className="sig-dark-panel rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="sig-label">Guia principal</p>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-950" title={protocolGuide?.code || "Não emitida"}>
                    {protocolGuide?.code || "Não emitida"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{formatCurrency(protocolGuide?.amount || 0)}</p>
                </div>
                <div className="sig-dark-panel rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="sig-label">Pagamento</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {protocolGuide?.status === "compensada" ? "Confirmado" : "Pendente"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Vencimento {protocolGuide?.dueDate || "-"}</p>
                </div>
                <div className="sig-dark-panel rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="sig-label">Responsável</p>
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <UserAvatar name={process.technicalLead} size="sm" />
                    <span className="sig-fit-title text-sm font-semibold leading-6 text-slate-950" title={process.technicalLead}>
                      {process.technicalLead}
                    </span>
                  </div>
                </div>
                <div className="sig-dark-panel rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="sig-label">Fluxo atual</p>
                  <p className="sig-fit-title mt-2 text-sm font-semibold leading-6 text-slate-950" title={process.dispatches[0]?.to || "Fluxo interno"}>
                    {process.dispatches[0]?.to || "Fluxo interno"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{process.sla.hoursRemaining}h para o SLA</p>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

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
          : `Triagem concluída. O protocolo agora aguarda a confirmação da guia inicial.`,
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
              <StatCard label="Protocolos registrados" value={String(processes.length)} description="Registro completo da Prefeitura" icon={ClipboardList} tone="blue" />
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
                              <Link to={`/processos/${process.id}`}>Abrir protocolo</Link>
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
            title="Todos os protocolos do Município"
            description="Registro completo das entradas protocoladas. Processos já despachados continuam disponíveis para consulta e rastreabilidade."
            icon={ClipboardList}
          >
            {renderQueueList(
              [...processes].sort((a, b) => getOpeningDate(b).localeCompare(getOpeningDate(a))),
              "Nenhum protocolo registrado para esta Prefeitura.",
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
                    {renderQueueList(onlineProtocolItems.slice(0, 6), "Nenhuma entrada digital disponível.")}
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
              <TableCard
                title="Conferência de pagamento do protocolo"
                description="A baixa da guia inicial é responsabilidade do Protocolo. Ao confirmar, o processo é encaminhado automaticamente para Análise Urbanística."
                icon={CircleDollarSign}
              >
                <div className="space-y-4">
                  {pendingProtocolPayments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
                      Nenhum pagamento de protocolo aguardando conferência.
                    </div>
                  ) : (
                    pendingProtocolPayments.map((process) => {
                      const guide = getProcessPaymentGuides(process, tenantSettings).find(
                        (item) => item.kind === "protocolo",
                      );
                      return (
                        <div key={process.id} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-950">
                                  {formatOfficialProcessNumber(process.protocol)}
                                </p>
                                <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                                  Pagamento pendente
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-slate-600">
                                {formatOfficialProcessTitle({ title: process.title, type: process.type })}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                                <span>Guia: <strong className="text-slate-900">{guide?.code || "Não emitida"}</strong></span>
                                <span>Valor: <strong className="text-slate-900">{formatCurrency(guide?.amount || 0)}</strong></span>
                                <span>Vencimento: <strong className="text-slate-900">{guide?.dueDate || "-"}</strong></span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild variant="outline" className="rounded-full">
                                <Link to={`/processos/${process.id}?aba=documentos`}>Revisar triagem</Link>
                              </Button>
                              {process.triage.status === "concluido" ? (
                                <Button
                                  type="button"
                                  className="rounded-full bg-emerald-700 px-5 text-white hover:bg-emerald-800"
                                  disabled={protocolActionBusy === `payment-${process.id}`}
                                  onClick={() => void handleConfirmProtocolPayment(process)}
                                >
                                  {protocolActionBusy === `payment-${process.id}`
                                    ? "Confirmando..."
                                    : "Confirmar pagamento"}
                                </Button>
                              ) : (
                                <Button asChild variant="outline" className="rounded-full">
                                  <Link to={`/processos/${process.id}?aba=documentos`}>Concluir triagem primeiro</Link>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </TableCard>
            </PageMainContent>
            <PageSideContent>
              <SectionCard
                title="Responsabilidade do Protocolo"
                description="A guia inicial não depende do Financeiro para avançar o processo."
              >
                <div className="space-y-3">
                  <AlertCard
                    title="Aguardando baixa"
                    description={`${pendingProtocolPayments.length} guia(s) de protocolo aguardam conferência.`}
                    tone={pendingProtocolPayments.length > 0 ? "warning" : "success"}
                    icon={CircleDollarSign}
                  />
                  <AlertCard
                    title="Já confirmados"
                    description={`${confirmedProtocolPayments.length} pagamento(s) de protocolo já foram confirmados.`}
                    tone="success"
                    icon={CheckCircle2}
                  />
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
                    Depois da baixa, o processo sai da fila do Protocolo e segue para {URBAN_ANALYSIS_DEPARTMENT}.
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
                {renderQueueList(onlineProtocolItems.slice(0, 4), "Nenhum protocolo digital em atendimento.")}
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
