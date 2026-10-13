import {
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  ListTodo,
  Search,
  Send,
  Stamp,
  TimerReset,
  Users2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCard } from "@/components/platform/AlertCard";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageHeader } from "@/components/platform/PageHeader";
import { PortalFrame } from "@/components/platform/PortalFrame";
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
import {
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getChecklistTemplate,
  getProcessPaymentGuides,
  getVisibleProcessesByScope,
  parseMarker,
  statusLabel,
  statusTone,
  type ProcessRecord,
  URBAN_ANALYSIS_DEPARTMENT,
} from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";

type AnalystSection =
  | "visao-geral"
  | "fila"
  | "pendencias"
  | "correcoes"
  | "historico"
  | "indicadores";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).split('"').join('""')}"`).join(";"))
    .join("\n");
  const link = document.createElement("a");
  link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  link.download = filename;
  link.click();
}

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
    updateProcessStatus,
    startProcessAnalysis,
    dispatchProcess,
    createRequirement,
    documentTemplates,
    getInstitutionSettings,
  } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings = getInstitutionSettings(effectiveScopeId ?? session.tenantId);
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<AnalystSection>("visao-geral");
  const [actionBusy, setActionBusy] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const currentUnit =
    session.role === "analista"
      ? session.department || session.title || URBAN_ANALYSIS_DEPARTMENT
      : URBAN_ANALYSIS_DEPARTMENT;

  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses).filter((item) => {
    const haystack = `${formatOfficialProcessNumber(item.protocol)} ${item.externalProtocol} ${item.title} ${item.ownerName} ${item.property.iptu}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const requirementsOpen = processes.reduce(
    (count, process) => count + getOpenRequirements(process).length,
    0,
  );
  const slaCritical = processes.filter((item) => item.sla.breached || item.sla.hoursRemaining <= 12);
  const analysisActiveStatuses = [
    "distribuicao",
    "analise_tecnica",
    "pendencia_documental",
    "exigencia",
    "reapresentacao",
    "despacho_intersetorial",
  ] as const;
  const inReview = processes.filter((item) => item.status === "analise_tecnica");
  const completed = processes.filter((item) => item.status === "deferido");
  const correctionQueue = processes.filter(
    (item) => item.status === "reapresentacao" || item.status === "exigencia",
  );
  const blockedItems = processes.filter(
    (item) => item.status === "pendencia_documental" || item.status === "exigencia",
  );
  const analysisWorkItems = processes.filter((item) =>
    analysisActiveStatuses.includes(item.status as (typeof analysisActiveStatuses)[number]),
  );
  const analysisTrackedProcesses = processes.filter(
    (item) => Boolean(item.analysis?.startedAt || item.analysis?.assignedTo),
  );
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
    processes.length > 0
      ? Math.round(processes.reduce((total, item) => total + item.sla.hoursRemaining, 0) / processes.length)
      : 0;

  const dispatchTemplate = documentTemplates.find((item) => item.type === "despacho");
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

  const handleStartAnalysis = async (process: ProcessRecord) => {
    if (process.analysis?.startedAt) {
      navigate(`/processos/${process.id}?aba=analise`);
      return;
    }

    const ok = await runAnalystAction(
      `start-${process.id}`,
      "Análise Urbanística iniciada. O processo foi atribuído ao analista e aberto na mesa de trabalho.",
      () => startProcessAnalysis(process.id),
    );

    if (ok) {
      navigate(`/processos/${process.id}?aba=analise`);
    }
  };

  const navItems = [
    { value: "visao-geral", label: "Resumo", helper: "Prioridades da mesa técnica" },
    { value: "fila", label: "Fila de análise", helper: "Operação técnica principal" },
    { value: "pendencias", label: "Pendências", helper: "Bloqueios e inconsistências" },
    { value: "correcoes", label: "Correções solicitadas", helper: "Retornos e reapresentação" },
    { value: "historico", label: "Histórico técnico", helper: "Comentários, decisões e movimentos" },
    { value: "indicadores", label: "Indicadores e SLA", helper: "Carga, prazo e produtividade" },
  ] as const;

  const renderQueue = (items = queue, emptyMessage = "Nenhum processo encontrado com os filtros atuais.") => (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
          {emptyMessage}
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
          const currentAnalyst = process.analysis?.assignedTo || "Aguardando início";

          return (
            <div key={process.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-[min(100%,240px)] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="sig-fit-title text-base font-semibold leading-6 text-slate-950" title={formatOfficialProcessNumber(process.protocol)}>
                      {formatOfficialProcessNumber(process.protocol)}
                    </p>
                    <Badge variant="outline" className={statusTone(process.status)}>
                      {statusLabel(process.status)}
                    </Badge>
                    <Badge className={`rounded-full border ${getPriorityBadge(process)}`}>
                      {getPriorityLabel(process)}
                    </Badge>
                    {process.triage.status !== "concluido" ? (
                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                        Triagem
                      </Badge>
                    ) : null}
                  </div>

                  <p className="mt-2 text-sm font-medium text-slate-900">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                  <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={`${process.address} • IPTU ${process.property.iptu} • Matrícula ${process.property.registration}`}>
                    {process.address} • IPTU {process.property.iptu} • Matrícula {process.property.registration}
                  </p>
                </div>

                <Link
                  to={`/processos/${process.id}`}
                  className="sig-dark-action-btn inline-flex h-11 w-full items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-medium text-white sm:w-auto"
                >
                  Abrir processo
                </Link>
              </div>

              <div className="sig-responsive-data-grid mt-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="sig-label">Responsável pela análise</p>
                  <p className="sig-fit-title mt-2 text-sm font-semibold leading-6 text-slate-950" title={currentAnalyst}>
                    {currentAnalyst}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {analysisStarted ? "Análise assumida e registrada" : "Clique em Iniciar análise para assumir"}
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

              <div className="mt-4 flex flex-wrap gap-2">
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

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant={analysisStarted ? "default" : "outline"}
                  className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void handleStartAnalysis(process)}
                >
                  {actionBusy === `start-${process.id}`
                    ? "Iniciando..."
                    : analysisStarted
                      ? "Continuar análise"
                      : "Iniciar análise"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="sig-dark-action-btn h-11 w-full rounded-full text-slate-50 sm:w-auto"
                  disabled={Boolean(actionBusy)}
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
                      disabled={Boolean(actionBusy) || !analysisStarted || pendingRequirements.length > 0 || missingRequiredDocuments > 0}
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
                    disabled={Boolean(actionBusy) || !analysisStarted || pendingRequirements.length > 0 || missingRequiredDocuments > 0}
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
                    disabled={Boolean(actionBusy) || !analysisStarted || pendingRequirements.length > 0 || missingRequiredDocuments > 0}
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
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <PortalFrame eyebrow="MESA TÉCNICA" title="Fila técnica, SLA e decisões">
      <PageShell>
        <PageHeader
          eyebrow="Análise Urbanística"
          title="Fila técnica, prioridade e decisão"
          description="Conduza a análise diária com foco em prazo, pendências e decisão técnica."
          icon={Stamp}
          actions={
            <Button
              type="button"
              className="rounded-full bg-slate-950 hover:bg-slate-900"
              onClick={() =>
                downloadCsv("relatorio-analise.csv", [
                  ["Protocolo", "Projeto", "Status", "SLA", "Pendências", "Responsável"],
                  ...processes.map((process) => [
                    formatOfficialProcessNumber(process.protocol),
                    formatOfficialProcessTitle({ title: process.title, type: process.type }),
                    statusLabel(process.status),
                    `${process.sla.currentStage} - ${process.sla.hoursRemaining}h`,
                    String(getOpenRequirements(process).length),
                    process.technicalLead,
                  ]),
                ])
              }
            >
              <Download className="mr-2 h-4 w-4 text-sky-200" />
              Exportar fila
            </Button>
          }
        />

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
          items={navItems as unknown as Array<{ value: string; label: string; helper?: string }>}
          value={section}
          onChange={(value) => setSection(value as AnalystSection)}
        />

        {section === "visao-geral" && (
          <>
            <PageStatsRow>
              <StatCard label="Em análise" value={String(inReview.length)} description="Pareceres em andamento" icon={Stamp} tone="blue" />
              <StatCard label="Pendências" value={String(requirementsOpen)} description="Exigências abertas" icon={Clock3} tone="amber" />
              <StatCard label="SLA crítico" value={String(slaCritical.length)} description="Prazo curto ou vencido" icon={TimerReset} tone="rose" />
              <StatCard label="Concluídos" value={String(completed.length)} description="Decisões finalizadas" icon={CheckCircle2} tone="emerald" />
            </PageStatsRow>

            <PageMainGrid>
              <PageMainContent>
                <TableCard
                  title="Prioridades da mesa técnica"
                  description="Apenas os processos que precisam de leitura primeiro. A fila completa fica na aba Fila de análise."
                  icon={ListTodo}
                  actions={
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => setSection("fila")}>
                      Ver fila completa
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
                        <div key={process.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="sig-fit-title text-sm font-semibold text-slate-950">
                                {formatOfficialProcessNumber(process.protocol)}
                              </p>
                              <Badge className={`rounded-full border ${getPriorityBadge(process)}`}>
                                {getPriorityLabel(process)}
                              </Badge>
                              <Badge variant="outline" className={statusTone(process.status)}>
                                {statusLabel(process.status)}
                              </Badge>
                            </div>
                            <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                              {formatOfficialProcessTitle({ title: process.title, type: process.type })}
                            </p>
                          </div>
                          <Button asChild variant="outline" className="shrink-0 rounded-full">
                            <Link to={`/processos/${process.id}?aba=analise`}>Abrir análise</Link>
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
                        <div key={process.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="sig-fit-title text-sm font-semibold text-slate-950">
                                {formatOfficialProcessNumber(process.protocol)}
                              </p>
                              <Badge variant="outline" className={statusTone(process.status)}>
                                {statusLabel(process.status)}
                              </Badge>
                              <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-sky-800">
                                {process.processControl?.currentFolder || process.sla.currentStage}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">
                              Responsável pela análise: {process.analysis?.assignedTo || "Não atribuído"}
                            </p>
                          </div>
                          <Button asChild variant="outline" className="shrink-0 rounded-full">
                            <Link to={`/processos/${process.id}?aba=analise`}>Consultar análise</Link>
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
          <TableCard
            title="Fila de análise"
            description="Leitura completa da fila técnica, com prioridade, prazo, responsável e ação."
            icon={ListTodo}
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
            {renderQueue(queue)}
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
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
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
                              <Link to={`/processos/${item.processId}?aba=analise`}>Abrir processo</Link>
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
                          <p className="sig-fit-title text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(process.protocol)}</p>
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
                            <p className="sig-fit-title text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(process.protocol)}</p>
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
