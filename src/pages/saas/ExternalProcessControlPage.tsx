import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Calendar, Clock3, CreditCard, Eye, FileBarChart2, FileCheck, FileText, Filter, ListChecks, Search, TrendingUp, Workflow } from "lucide-react";
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
import {
  formatCurrency,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getProcessPaymentGuides,
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
  { value: "deferido", label: "Deferido" },
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

export function ExternalProcessControlPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const { processes: allProcesses, getInstitutionSettings } = usePlatformData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [stageFilter, setStageFilter] = useState("todos");
  const [periodFilter, setPeriodFilter] = useState("todos");
  const processListRef = useRef<HTMLDivElement | null>(null);
  const processSummaryRef = useRef<HTMLDivElement | null>(null);

  const activeTab = getExternalTabByPath(location.pathname);

  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);

  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
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
        getProcessPaymentGuides(process, tenantSettings).some((guide) => guide.status !== "compensada"),
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
            <div ref={processListRef} className="scroll-mt-28">
            <SectionPanel
              title="Processos em acompanhamento"
              description="Filtre por protocolo, etapa e status para localizar rapidamente cada processo."
              className="min-w-0"
              actions={
                <div className="mt-2 grid w-full gap-3 xl:grid-cols-[minmax(0,1fr)_210px_220px_200px]">
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
              }
              contentClassName="space-y-4"
            >
              <div data-process-list-header="true" className="hidden rounded-[18px] border px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.15em] shadow-sm 2xl:grid 2xl:grid-cols-[1.35fr_0.88fr_1.12fr_0.92fr_1.18fr] 2xl:gap-0">
                <span>Processo</span>
                <span>Status</span>
                <span>Etapa atual</span>
                <span>Pagamento</span>
                <span className="text-right">Ações</span>
              </div>

              {filteredProcesses.map((process) => {
                const guides = getProcessPaymentGuides(process, tenantSettings);
                const pendingGuide = guides.find((guide) => guide.status !== "compensada");
                const lastUpdateLabel = formatProcessDate(process);
                const officialNumber = formatOfficialProcessNumber(process.protocol);
                const officialTitle = formatOfficialProcessTitle({ title: process.title, type: process.type });
                const currentStage = process.sla?.currentStage || "Em andamento";

                return (
                  <article
                    key={process.id}
                    data-process-premium-card="true"
                    className="group overflow-hidden rounded-[22px] border shadow-[0_10px_30px_rgba(15,23,42,0.055)] transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <div className="grid gap-0 2xl:grid-cols-[1.35fr_0.88fr_1.12fr_0.92fr_1.18fr] 2xl:items-stretch">
                      <div className="min-w-0 p-5 2xl:border-r 2xl:border-slate-200/80 dark:2xl:border-slate-700/80">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
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
                              {statusLabel(process.status)}
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
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${pendingGuide ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>
                            <CreditCard className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Pagamento</p>
                            <p className="mt-2 text-[15px] font-bold leading-5 text-slate-950 dark:text-white">
                              {pendingGuide ? formatCurrency(pendingGuide.amount) : "Pago"}
                            </p>
                            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${pendingGuide ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800"}`}>
                              {pendingGuide ? "Aguardando pagamento" : "Compensado"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex min-w-0 flex-col justify-center gap-2 border-t border-slate-200/80 p-5 dark:border-slate-700/80 2xl:border-t-0">
                        <MarkerSelector
                          processId={process.id}
                          tags={process.tags}
                          actor={session.name}
                          triggerClassName="h-10 w-full rounded-xl border-slate-200 bg-white text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        />
                        <Button asChild className="h-11 w-full rounded-xl bg-slate-950 text-[13px] font-semibold !text-white shadow-[0_8px_18px_rgba(15,23,42,0.22)] hover:bg-slate-900 [&_*]:!text-white">
                          <Link to={`/processos/${process.id}`} className="flex w-full items-center justify-center gap-2 !text-white">
                            <Eye className="h-4 w-4 shrink-0 !text-white" />
                            <span className="!text-white">Ver detalhes</span>
                          </Link>
                        </Button>
                        <Button asChild variant="outline" className="h-11 w-full rounded-xl border-slate-300 bg-white text-[13px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
                          <Link to={`/processos/${process.id}?aba=fluxo`}>
                            <Workflow className="mr-2 h-4 w-4" />
                            Acompanhar fluxo
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {filteredProcesses.length === 0 ? (
                <div className="sig-dark-panel rounded-[12px] border border-dashed border-slate-300 p-8 text-center">
                  <p className="text-[18px] font-semibold leading-7 text-slate-900">Nenhum processo encontrado</p>
                  <p className="mt-2 text-[15px] leading-7 text-slate-600">
                    Você ainda não possui protocolos com os filtros selecionados.
                  </p>
                  <Button asChild className="mt-4 rounded-full bg-slate-950 hover:bg-slate-900">
                    <Link to="/externo/protocolar">Novo protocolo</Link>
                  </Button>
                </div>
              ) : null}
            </SectionPanel>
            </div>

            <div className="sticky bottom-5 z-20 flex justify-end pointer-events-none">
              <Button
                type="button"
                className="pointer-events-auto h-11 rounded-full bg-slate-950 px-4 text-[12px] font-semibold !text-white shadow-[0_12px_28px_rgba(15,23,42,0.22)] hover:bg-slate-900 [&_*]:!text-white"
                onClick={() => processSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <ArrowDown className="mr-2 h-4 w-4" />
                Pendências e movimentações
              </Button>
            </div>

            <div ref={processSummaryRef} className="grid scroll-mt-28 gap-5 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
              <SectionPanel
                title="Pendências do profissional"
                description="Exigências que precisam de retorno, complementação ou novo envio de documento."
                className="h-full min-w-0"
                contentClassName="space-y-3"
              >
                {requirementCount === 0 ? (
                  <div className="sig-dark-panel flex min-h-[164px] items-center rounded-[10px] border border-dashed border-slate-300 p-5 text-[14px] leading-6 text-slate-600">
                    Nenhuma pendência aberta no momento.
                  </div>
                ) : (
                  filteredProcesses
                    .filter((process) => (process.requirements ?? []).length > 0)
                    .slice(0, 4)
                    .map((process) => (
                      <div key={`req-${process.id}`} className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4 text-sm text-slate-700">
                        <p className="text-[14px] font-semibold leading-6 text-slate-900">{formatOfficialProcessNumber(process.protocol)}</p>
                        <p className="mt-1 line-clamp-3 text-[14px] leading-6 text-slate-600">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                        <p className="mt-2 text-[12px] font-medium uppercase tracking-[0.08em] text-amber-600 dark:text-amber-400">
                          Exigência pendente
                        </p>
                      </div>
                    ))
                )}
              </SectionPanel>

              <SectionPanel
                title="Últimas movimentações"
                description="Processos atualizados recentemente para acompanhamento rápido."
                className="h-full min-w-0"
                contentClassName="space-y-3"
              >
                {recentMovements.length === 0 ? (
                  <div className="sig-dark-panel flex min-h-[164px] items-center rounded-[10px] border border-dashed border-slate-300 p-5 text-[14px] leading-6 text-slate-600">
                    Nenhuma movimentação recente encontrada.
                  </div>
                ) : (
                  recentMovements.map((process) => (
                    <div key={`recent-${process.id}`} className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4 text-sm">
                      <p className="text-[14px] font-semibold leading-6 text-slate-900">{formatOfficialProcessNumber(process.protocol)}</p>
                      <p className="mt-1 line-clamp-3 text-[14px] leading-6 text-slate-600">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                      <p className="mt-2 text-[12px] uppercase tracking-[0.08em] text-slate-500">
                        Etapa: {process.sla?.currentStage || "Em andamento"}
                      </p>
                    </div>
                  ))
                )}
              </SectionPanel>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full border-slate-300 bg-white px-4 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                onClick={() => processListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <ArrowUp className="mr-2 h-4 w-4" />
                Voltar para processos
              </Button>
            </div>
          </MainContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
  );
}
