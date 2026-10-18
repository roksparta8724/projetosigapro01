import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Calendar, Clock3, CreditCard, Eye, FileBarChart2, FileCheck, FilePenLine, FileText, Filter, FolderKanban, ListChecks, Search, TrendingUp, Workflow, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/platform/MetricCard";
import { MarkerSelector } from "@/components/platform/MarkerSelector";
import {
  MainContent,
  MainGrid,
  PageContainer,
  StatsCards,
} from "@/components/platform/PageLayout";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { externalTabs, getExternalTabByPath } from "@/lib/externalTabs";
import { listProtocolDrafts } from "@/lib/protocolDraft";
import {
  buildProcessPath,
  formatCurrency,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getExternallyVisibleProcessPaymentGuides,
  getVisibleProcessesByScope,
  parseMarker,
  statusLabel,
  statusTone,
} from "@/lib/platform";

const statusOptions = [
  { value: "todos", label: "Todos os status" },
  { value: "triagem", label: "Triagem" },
  { value: "analise_tecnica", label: "Em análise" },
  { value: "exigencia", label: "Com exigência" },
  { value: "pagamento_pendente", label: "Aguardando pagamento" },
  { value: "pagamento_confirmado", label: "Pagamento confirmado" },
  { value: "deferido", label: "Concluído" },
  { value: "indeferido", label: "Indeferido" },
  { value: "arquivado", label: "Arquivado" },
];

const periodOptions = [
  { value: "todos", label: "Todo o período" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 180 dias" },
];

function getProcessDateValue(process: unknown): string | null {
  const record = process as Record<string, unknown>;
  const candidates = [
    record.updatedAt,
    record.createdAt,
    record.updated_at,
    record.created_at,
    record.lastUpdatedAt,
    record.openedAt,
    record.protocolDate,
    record.date,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function formatProcessDate(process: unknown): string {
  const rawDate = getProcessDateValue(process);
  if (!rawDate) return "—";

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("pt-BR");
}

function externalProcessStatusLabel(status: string) {
  if (status === "deferido") return "Concluído";
  return statusLabel(status as Parameters<typeof statusLabel>[0]);
}

function compactExternalGuideLabel(kind: string) {
  switch (kind) {
    case "protocolo":
      return "Protocolo";
    case "iss_obra":
      return "Análise / ISSQN";
    case "aprovacao_final":
      return "Aprovação / Alvará";
    default:
      return "Pagamento";
  }
}

function isGuideCompensated(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLocaleLowerCase("pt-BR");
  return ["compensada", "pago", "paid", "confirmed", "confirmado"].includes(normalized);
}

export function ExternalProcessControlPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const {
    processes: allProcesses,
    getInstitutionSettings,
    loading: platformLoading,
    dataError,
    dataReadyForCurrentUser,
    refreshRemoteStore,
  } = usePlatformData();

  const recoveryAttemptedRef = useRef(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [stageFilter, setStageFilter] = useState("todos");
  const [periodFilter, setPeriodFilter] = useState("todos");
  const [summaryOpen, setSummaryOpen] = useState(false);

  const activeTab = getExternalTabByPath(location.pathname);

  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);
  const savedDrafts = listProtocolDrafts(session.id, effectiveScopeId, session.tenantId);

  useEffect(() => {
    if (
      platformLoading ||
      recoveryAttemptedRef.current ||
      allProcesses.length > 0 ||
      session.id === "unknown"
    ) {
      return;
    }

    recoveryAttemptedRef.current = true;
    void refreshRemoteStore().catch((error) => {
      console.warn("[SIGAPRO][Externo] Falha na tentativa automática de recuperar a carteira.", error);
    });
  }, [allProcesses.length, platformLoading, refreshRemoteStore, session.id]);

  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses).filter(
    (process) => process.isOfficial !== false,
  );
  const filteredProcesses = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const periodDays = Number(periodFilter);
    const periodThreshold =
      periodFilter === "todos"
        ? null
        : new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    return processes.filter((process) => {
      const matchesStatus = statusFilter === "todos" || process.status === statusFilter;
      const matchesStage = stageFilter === "todos" || process.sla?.currentStage === stageFilter;
      const matchesSearch =
        !normalizedSearch ||
        process.protocol.toLowerCase().includes(normalizedSearch) ||
        process.externalProtocol.toLowerCase().includes(normalizedSearch) ||
        process.title.toLowerCase().includes(normalizedSearch) ||
        process.address.toLowerCase().includes(normalizedSearch);

      const rawDate = getProcessDateValue(process);
      const parsedDate = rawDate ? new Date(rawDate) : null;

      const matchesPeriod =
        !periodThreshold ||
        !parsedDate ||
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate >= periodThreshold;

      return matchesStatus && matchesStage && matchesSearch && matchesPeriod;
    });
  }, [processes, search, stageFilter, statusFilter, periodFilter]);

  const recentMovements = useMemo(
    () =>
      [...processes]
        .sort((a, b) => {
          const dateA = getProcessDateValue(a);
          const dateB = getProcessDateValue(b);

          const timeA = dateA ? new Date(dateA).getTime() : 0;
          const timeB = dateB ? new Date(dateB).getTime() : 0;

          return timeB - timeA;
        })
        .slice(0, 3),
    [processes],
  );

  const activeCount = useMemo(
    () => processes.filter((process) => !["deferido", "indeferido", "arquivado"].includes(process.status)).length,
    [processes],
  );

  const requirementCount = useMemo(
    () =>
      processes.reduce(
        (total, process) =>
          total +
          (process.requirements ?? []).filter((requirement) => {
            const status = String((requirement as { status?: unknown })?.status ?? "").toLowerCase();
            return status !== "resolvida" && status !== "resolvido" && status !== "concluida" && status !== "concluido";
          }).length,
        0,
      ),
    [processes],
  );

  const paymentCount = useMemo(
    () =>
      processes.filter((process) =>
        getExternallyVisibleProcessPaymentGuides(process, tenantSettings).some((guide) => guide.status !== "compensada"),
      ).length,
    [processes, tenantSettings],
  );

  const completedCount = useMemo(
    () => processes.filter((process) => ["deferido", "indeferido", "arquivado"].includes(process.status)).length,
    [processes],
  );

  const stages = useMemo(
    () =>
      Array.from(
        new Set(
          processes
            .map((process) => process.sla?.currentStage?.trim())
            .filter((stage): stage is string => Boolean(stage)),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [processes],
  );

  return (
    <PortalFrame eyebrow="Acesso do profissional" title="Controle de processos">
      <PageContainer>
        <PageIntro
          eyebrow="Controle de processos"
          title="Acompanhe seus protocolos em um painel operacional"
          description="Monitore etapas, pendências, pagamentos e movimentações com visão clara, leitura rápida e foco no que realmente precisa de atenção."
          icon={TrendingUp}
          actions={
            <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
              <Link to="/externo/protocolar">Novo protocolo</Link>
            </Button>
          }
        />

        <InternalTabs
          items={externalTabs.map(({ value, label, helper }) => ({ value, label, helper }))}
          value={activeTab.value}
          onChange={(value) => {
            const target = externalTabs.find((tab) => tab.value === value);
            if (target) navigate(target.route);
          }}
        />

        <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <Button type="button" data-control-subnav-active="true" className="rounded-xl bg-slate-950 !text-white hover:bg-slate-900 [&_*]:!text-white">
            <FolderKanban className="mr-2 h-4 w-4" />
            Processos protocolados
          </Button>
          <Button asChild variant="ghost" className="rounded-xl">
            <Link to="/externo/controle/em-andamento">
              <FilePenLine className="mr-2 h-4 w-4" />
              Em andamento
              {savedDrafts.length > 0 ? (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-200">
                  {savedDrafts.length}
                </span>
              ) : null}
            </Link>
          </Button>
        </div>

        <StatsCards>
          <MetricCard
            title="Em andamento"
            value={String(activeCount)}
            helper="Processos ativos"
            icon={FileBarChart2}
            tone="blue"
          />
          <MetricCard
            title="Com exigências"
            value={String(requirementCount)}
            helper="Pendências abertas"
            icon={Filter}
            tone="amber"
          />
          <MetricCard
            title="Aguardando pagamento"
            value={String(paymentCount)}
            helper="Guias pendentes"
            icon={Calendar}
            tone="rose"
          />
          <MetricCard
            title="Concluídos"
            value={String(completedCount)}
            helper="Processos encerrados"
            icon={FileCheck}
            tone="emerald"
          />
        </StatsCards>

        <MainGrid className="xl:grid-cols-1 min-[1480px]:grid-cols-1 min-[1680px]:grid-cols-1">
          <MainContent>
            <div>
            <SectionPanel
              title="Processos em acompanhamento"
              description="Filtre por protocolo, etapa e status para localizar rapidamente cada processo."
              className="min-w-0"
              actions={
                <div className="mt-2 w-full space-y-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      aria-label="Abrir pendências e movimentações"
                      className="h-10 rounded-full bg-slate-950 px-4 text-[12px] font-semibold !text-white shadow-[0_10px_24px_rgba(15,23,42,0.2)] hover:bg-slate-900 [&_*]:!text-white"
                      onClick={() => setSummaryOpen(true)}
                    >
                      <Activity className="mr-2 h-4 w-4" />
                      Pendências e movimentações
                      {requirementCount > 0 ? (
                        <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-bold !text-slate-950">
                          {requirementCount}
                        </span>
                      ) : null}
                    </Button>
                  </div>

                  <div className="grid w-full gap-3 xl:grid-cols-[minmax(0,1fr)_210px_220px_200px]">
                    <div className="relative min-w-0">
                      <Search className="sig-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar protocolo, projeto ou endereço"
                        className="h-11 rounded-2xl pl-9 text-[14px]"
                      />
                    </div>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-11 w-full rounded-2xl sig-dark-panel text-[14px]">
                        <SelectValue placeholder="Todos os status" />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={stageFilter} onValueChange={setStageFilter}>
                      <SelectTrigger className="h-11 w-full rounded-2xl sig-dark-panel text-[14px]">
                        <SelectValue placeholder="Todas as etapas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas as etapas</SelectItem>
                        {stages.map((stage) => (
                          <SelectItem key={stage} value={stage}>
                            {stage}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={periodFilter} onValueChange={setPeriodFilter}>
                      <SelectTrigger className="h-11 w-full rounded-2xl sig-dark-panel text-[14px]">
                        <SelectValue placeholder="Todo o período" />
                      </SelectTrigger>
                      <SelectContent>
                        {periodOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              }
              contentClassName="space-y-4"
            >
              <div data-process-list-header="true" className="hidden rounded-[18px] border px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.15em] shadow-sm 2xl:grid 2xl:grid-cols-[1.28fr_0.78fr_1.02fr_1.28fr_1.08fr] 2xl:gap-0">
                <span>Processo</span>
                <span>Status</span>
                <span>Etapa atual</span>
                <span>Pagamento</span>
                <span className="text-right">Ações</span>
              </div>

              {filteredProcesses.map((process) => {
                const guides = getExternallyVisibleProcessPaymentGuides(process, tenantSettings);
                const displayGuides = ["protocolo", "iss_obra", "aprovacao_final"]
                  .map((kind) => guides.find((guide) => guide.kind === kind))
                  .filter((guide): guide is (typeof guides)[number] => Boolean(guide));
                const hasPendingGuide = displayGuides.some(
                  (guide) => !isGuideCompensated(guide.status),
                );
                const lastUpdateLabel = formatProcessDate(process);
                const officialNumber = formatOfficialProcessNumber(process.protocol);
                const officialTitle = formatOfficialProcessTitle({ title: process.title, type: process.type });
                const currentStage = process.sla?.currentStage || "Em andamento";

                return (
                  <article
                    key={process.id}
                    data-process-premium-card="true"
                    className="group overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.11)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_42px_rgba(0,0,0,0.24)]"
                  >
                    <div className="grid gap-0 2xl:grid-cols-[1.28fr_0.78fr_1.02fr_1.28fr_1.08fr] 2xl:items-stretch">
                      <div className="min-w-0 p-5 2xl:border-r 2xl:border-slate-200/80 dark:2xl:border-slate-700/80">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400 dark:text-slate-400">Processo nº</p>
                            <p className="mt-1 truncate text-[19px] font-bold leading-6 tracking-[-0.02em] text-slate-950 dark:text-white" title={officialNumber}>
                              {officialNumber}
                            </p>
                            <p className="mt-2 truncate text-[14px] font-semibold leading-5 text-slate-800 dark:text-slate-100" title={officialTitle}>
                              {officialTitle}
                            </p>
                            <p className="mt-0.5 truncate text-[12px] leading-5 text-slate-500 dark:text-slate-400" title={process.type}>
                              {process.type}
                            </p>
                          </div>
                        </div>

                        {process.tags?.length ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {process.tags.map((tag) => {
                              const marker = parseMarker(tag);
                              return (
                                <span
                                  key={`${process.id}-${tag}`}
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: marker.color }} />
                                  {marker.label}
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-0 border-t border-slate-200/80 p-5 dark:border-slate-700/80 2xl:border-l-0 2xl:border-t-0 2xl:border-r">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
                            <ListChecks className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Status</p>
                            <Badge
                              variant="outline"
                              className={`mt-2 rounded-full px-3 py-1 text-[12px] font-semibold capitalize ${statusTone(process.status)}`}
                            >
                              {externalProcessStatusLabel(process.status)}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 border-t border-slate-200/80 p-5 dark:border-slate-700/80 2xl:border-t-0 2xl:border-r">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                            <Workflow className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Etapa atual</p>
                            <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-5 text-slate-900 dark:text-slate-100" title={currentStage}>
                              {currentStage}
                            </p>
                            <div className="mt-3 flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
                              <Clock3 className="h-3.5 w-3.5" />
                              <span>{lastUpdateLabel === "—" ? "Sem movimentação registrada" : `Atualizado em ${lastUpdateLabel}`}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 border-t border-slate-200/80 p-5 2xl:border-t-0 2xl:border-r">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${hasPendingGuide ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>
                            <CreditCard className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Pagamentos</p>
                            {displayGuides.length > 0 ? (
                              <div className="mt-2 space-y-2">
                                {displayGuides.map((guide) => {
                                  const compensated = isGuideCompensated(guide.status);
                                  return (
                                    <div
                                      key={`${process.id}-payment-${guide.kind}`}
                                      data-external-payment-guide={guide.kind}
                                      className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-[0_3px_10px_rgba(15,23,42,0.035)] dark:border-slate-700 dark:bg-slate-950/35"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                          {compactExternalGuideLabel(guide.kind)}
                                        </span>
                                        <span className="shrink-0 text-[12px] font-extrabold text-slate-950 dark:text-white">
                                          {formatCurrency(guide.amount)}
                                        </span>
                                      </div>
                                      <div className="mt-1.5 flex items-center justify-between gap-2">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${compensated ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800"}`}>
                                          {compensated ? "Compensado" : "Pendente"}
                                        </span>
                                        {guide.code ? (
                                          <span className="truncate text-[9px] font-semibold text-slate-400" title={guide.code}>
                                            {guide.code}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="mt-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                                Nenhuma guia liberada
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex min-w-0 flex-col justify-center gap-2.5 border-t border-slate-200/80 p-5 dark:border-slate-700/80 2xl:border-t-0">
                        <MarkerSelector
                          processId={process.id}
                          tags={process.tags}
                          actor={session.name}
                          triggerClassName="h-10 w-full rounded-xl border-slate-200 bg-white text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        />
                        <Button asChild variant="outline" className="h-10 w-full rounded-xl border-slate-300 bg-white text-[12px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
                          <Link to={buildProcessPath(process, "historico")}>
                            <Workflow className="mr-2 h-4 w-4" />
                            Acompanhar fluxo
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-end border-t border-slate-200/80 bg-slate-50/70 px-5 py-3 dark:border-slate-700/80 dark:bg-slate-950/35">
                      <Button
                        asChild
                        data-primary-action="process"
                        className="sig-primary-process-action h-11 min-w-[190px] rounded-[14px] px-5 text-[13px] font-extrabold tracking-[0.01em] !text-white shadow-[0_8px_20px_rgba(7,89,133,0.18)] transition hover:-translate-y-px hover:brightness-105 [&_*]:!text-white"
                      >
                        <Link to={buildProcessPath(process)} className="flex items-center justify-center gap-2 !text-white">
                          <Eye className="h-4 w-4 shrink-0 !text-white" />
                          <span className="!text-white">Abrir processo</span>
                        </Link>
                      </Button>
                    </div>
                  </article>
                );
              })}

              {filteredProcesses.length === 0 ? (
                <div className="sig-dark-panel rounded-[18px] border border-dashed border-slate-300 p-8 text-center">
                  {platformLoading || !dataReadyForCurrentUser ? (
                    <>
                      <p className="text-[18px] font-semibold leading-7 text-slate-900">
                        Carregando seus processos
                      </p>
                      <p className="mt-2 text-[15px] leading-7 text-slate-600">
                        A carteira oficial está sendo sincronizada com o banco municipal.
                      </p>
                    </>
                  ) : dataError && allProcesses.length === 0 ? (
                    <>
                      <p className="text-[18px] font-semibold leading-7 text-slate-900">
                        Reconectando sua carteira oficial
                      </p>
                      <p className="mt-2 text-[15px] leading-7 text-slate-600">
                        Seus processos não foram apagados. A leitura oficial será refeita sem alterar o fluxo, os documentos ou os pagamentos.
                      </p>
                      <Button
                        type="button"
                        className="mt-4 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-900"
                        onClick={() => {
                          recoveryAttemptedRef.current = true;
                          void refreshRemoteStore().catch(() => undefined);
                        }}
                      >
                        Tentar novamente
                      </Button>
                    </>
                  ) : processes.length > 0 ? (
                    <>
                      <p className="text-[18px] font-semibold leading-7 text-slate-900">
                        Nenhum processo corresponde aos filtros
                      </p>
                      <p className="mt-2 text-[15px] leading-7 text-slate-600">
                        Limpe ou altere os filtros para visualizar seus protocolos.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[18px] font-semibold leading-7 text-slate-900">
                        Nenhum processo protocolado
                      </p>
                      <p className="mt-2 text-[15px] leading-7 text-slate-600">
                        Quando houver um protocolo oficial vinculado ao seu perfil, ele aparecerá aqui.
                      </p>
                      <Button asChild className="mt-4 rounded-full bg-slate-950 hover:bg-slate-900">
                        <Link to="/externo/protocolar">Novo protocolo</Link>
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </SectionPanel>
            </div>

            {summaryOpen ? (
              <div
                className="fixed inset-0 z-[120] flex justify-end bg-slate-950/45 backdrop-blur-[2px]"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.currentTarget === event.target) setSummaryOpen(false);
                }}
              >
                <aside
                  data-process-summary-drawer="true"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Pendências e movimentações"
                  className="h-full w-full max-w-[760px] overflow-y-auto border-l p-5 shadow-[-24px_0_60px_rgba(2,6,23,0.28)] sm:p-6"
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                          <Activity className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Resumo operacional</p>
                          <h2 className="mt-1 text-[22px] font-bold tracking-[-0.02em] text-slate-950">Pendências e movimentações</h2>
                        </div>
                      </div>
                      <p className="mt-3 max-w-[58ch] text-[13px] leading-6 text-slate-500">
                        Consulte o que exige atenção e os processos atualizados recentemente sem sair da lista principal.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-10 shrink-0 rounded-full p-0"
                      onClick={() => setSummaryOpen(false)}
                      aria-label="Fechar painel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-5">
                    <section className="rounded-[20px] border p-5 shadow-sm">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
                            <AlertTriangle className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-[16px] font-bold text-slate-950">Pendências do profissional</h3>
                            <p className="mt-1 text-[12px] text-slate-500">Exigências que precisam de retorno ou complementação.</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800">
                          {requirementCount}
                        </span>
                      </div>

                      {requirementCount === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-[13px] text-slate-600">
                          Nenhuma pendência aberta no momento.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredProcesses
                            .filter((process) => (process.requirements ?? []).length > 0)
                            .slice(0, 8)
                            .map((process) => (
                              <div key={`drawer-req-${process.id}`} className="rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-slate-950">{formatOfficialProcessNumber(process.protocol)}</p>
                                    <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-600">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                                  </div>
                                  <Button asChild variant="outline" className="h-9 shrink-0 rounded-xl text-[11px]">
                                    <Link to={buildProcessPath(process)} onClick={() => setSummaryOpen(false)}>Abrir</Link>
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </section>

                    <section className="rounded-[20px] border p-5 shadow-sm">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
                          <Clock3 className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-[16px] font-bold text-slate-950">Últimas movimentações</h3>
                          <p className="mt-1 text-[12px] text-slate-500">Processos atualizados recentemente.</p>
                        </div>
                      </div>

                      {recentMovements.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-[13px] text-slate-600">
                          Nenhuma movimentação recente encontrada.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {recentMovements.map((process) => (
                            <div key={`drawer-recent-${process.id}`} className="rounded-2xl border border-slate-200 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[13px] font-bold text-slate-950">{formatOfficialProcessNumber(process.protocol)}</p>
                                  <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-600">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                                    Etapa: {process.sla?.currentStage || "Em andamento"}
                                  </p>
                                </div>
                                <Button asChild variant="outline" className="h-9 shrink-0 rounded-xl text-[11px]">
                                  <Link to={buildProcessPath(process, "historico")} onClick={() => setSummaryOpen(false)}>Ver fluxo</Link>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </aside>
              </div>
            ) : null}

          </MainContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
  );
}
