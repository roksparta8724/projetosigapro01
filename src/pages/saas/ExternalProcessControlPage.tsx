import { useMemo, useState } from "react";
import { Calendar, FileBarChart2, FileCheck, Filter, Search, TrendingUp } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/platform/MetricCard";
import {
  MainContent,
  MainGrid,
  PageContainer,
  SideContent,
  StatsCards,
} from "@/components/platform/PageLayout";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  formatCurrency,
  getProcessPaymentGuides,
  getVisibleProcessesByScope,
  statusLabel,
  statusTone,
} from "@/lib/platform";

const externalTabs = [
  { value: "visao", label: "Visão geral", helper: "Resumo executivo", route: "/externo" },
  { value: "protocolar", label: "Protocolar", helper: "Novo protocolo", route: "/externo/protocolar" },
  { value: "controle", label: "Controle de processos", helper: "Acompanhamento", route: "/externo/controle" },
];

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

  const activeTab =
    externalTabs.find((tab) => location.pathname === tab.route) ?? externalTabs[0];

  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);

  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);

  const completedStatuses = new Set(["deferido", "indeferido", "arquivado"]);
  const completedCount = processes.filter((process) => completedStatuses.has(process.status)).length;

  const requirementCount = processes.filter((process) =>
    (process.requirements ?? []).some(
      (item) => item.status === "aberta" || item.status === "respondida",
    ),
  ).length;

  const paymentCount = processes.filter(
    (process) =>
      process.payment?.status === "pendente" ||
      process.status === "pagamento_pendente" ||
      process.status === "guia_emitida",
  ).length;

  const activeCount = Math.max(processes.length - completedCount, 0);

  const stages = useMemo(
    () =>
      Array.from(
        new Set(
          processes
            .map((process) => process.sla?.currentStage)
            .filter((stage): stage is string => Boolean(stage)),
        ),
      ),
    [processes],
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

      const lastUpdate = new Date(process.updatedAt ?? process.createdAt ?? "");
      const matchesPeriod =
        !periodThreshold || Number.isNaN(lastUpdate.getTime()) || lastUpdate >= periodThreshold;

      return matchesStatus && matchesStage && matchesSearch && matchesPeriod;
    });
  }, [processes, search, stageFilter, statusFilter, periodFilter]);

  const recentMovements = useMemo(
    () =>
      [...processes]
        .sort(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.updatedAt ?? a.createdAt).getTime(),
        )
        .slice(0, 3),
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

        <MainGrid>
          <MainContent>
            <SectionPanel
              title="Processos em acompanhamento"
              description="Filtre por protocolo, status e etapa para localizar rapidamente cada processo."
              actions={
                <div className="mt-2 grid w-full gap-3 xl:grid-cols-[minmax(0,1fr)_210px_220px_200px]">
                  <div className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
              <div className="hidden rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 2xl:grid 2xl:grid-cols-[1.2fr_1fr_0.95fr_0.95fr_0.9fr_0.8fr_0.85fr] 2xl:gap-3">
                <span>Protocolo</span>
                <span>Projeto</span>
                <span>Status</span>
                <span>Etapa atual</span>
                <span>Última movimentação</span>
                <span>Pagamento</span>
                <span className="text-right">Ações</span>
              </div>

              {filteredProcesses.map((process) => {
                const guides = getProcessPaymentGuides(process, tenantSettings);
                const pendingGuide = guides.find((guide) => guide.status !== "compensada");
                const lastUpdate = process.updatedAt ?? process.createdAt;
                const lastUpdateLabel = lastUpdate
                  ? new Date(lastUpdate).toLocaleDateString("pt-BR")
                  : "—";

                return (
                  <div
                    key={process.id}
                    className="sig-dark-panel rounded-[12px] border border-[#E5E7EB] p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="grid gap-4 2xl:grid-cols-[1.2fr_1fr_0.95fr_0.95fr_0.9fr_0.8fr_0.85fr] 2xl:items-center">
                      <div className="min-w-0">
                        <p
                          className="truncate text-[15px] font-semibold leading-6 text-slate-950"
                          title={process.protocol}
                        >
                          {process.protocol}
                        </p>
                        <p
                          className="mt-1 truncate text-[13px] leading-5 text-slate-500"
                          title={process.externalProtocol}
                        >
                          {process.externalProtocol}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p
                          className="truncate text-[14px] font-semibold leading-6 text-slate-900"
                          title={process.title}
                        >
                          {process.title}
                        </p>
                        <p
                          className="mt-1 truncate text-[13px] leading-5 text-slate-500"
                          title={process.type}
                        >
                          {process.type}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <Badge
                          variant="outline"
                          className={`rounded-full px-3 py-1 text-[12px] capitalize ${statusTone(process.status)}`}
                        >
                          {statusLabel(process.status)}
                        </Badge>
                      </div>

                      <div className="min-w-0">
                        <p
                          className="truncate text-[14px] font-medium leading-6 text-slate-900"
                          title={process.sla?.currentStage || "Em andamento"}
                        >
                          {process.sla?.currentStage || "Em andamento"}
                        </p>
                        <p className="mt-1 text-[12px] uppercase tracking-[0.08em] text-slate-500">
                          Etapa atual
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[14px] font-medium leading-6 text-slate-900">
                          {lastUpdateLabel}
                        </p>
                        <p className="mt-1 text-[12px] uppercase tracking-[0.08em] text-slate-500">
                          Última movimentação
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold leading-6 text-slate-900">
                          {pendingGuide ? formatCurrency(pendingGuide.amount) : "Pago"}
                        </p>
                        <p className="mt-1 text-[12px] uppercase tracking-[0.08em] text-slate-500">
                          {pendingGuide ? "Aguardando" : "Compensado"}
                        </p>
                      </div>

                      <div className="flex justify-start 2xl:justify-end">
                        <Button asChild variant="outline" className="rounded-full text-[13px]">
                          <Link to={`/processos/${process.id}`}>Ver detalhes</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredProcesses.length === 0 ? (
                <div className="sig-dark-panel rounded-[12px] border border-dashed border-slate-300 p-8 text-center">
                  <p className="text-[18px] font-semibold leading-7 text-slate-900">
                    Nenhum processo encontrado
                  </p>
                  <p className="mt-2 text-[15px] leading-7 text-slate-600">
                    Não há protocolos compatíveis com os filtros aplicados neste momento.
                  </p>
                  <Button asChild className="mt-4 rounded-full bg-slate-950 hover:bg-slate-900">
                    <Link to="/externo/protocolar">Novo protocolo</Link>
                  </Button>
                </div>
              ) : null}
            </SectionPanel>
          </MainContent>

          <SideContent>
            <SectionPanel
              title="Pendências do profissional"
              description="Exigências que precisam de retorno, complementação ou novo envio de documento."
              contentClassName="space-y-3"
            >
              {requirementCount === 0 ? (
                <div className="sig-dark-panel rounded-[10px] border border-dashed border-slate-300 p-4 text-[14px] leading-6 text-slate-600">
                  Nenhuma pendência aberta no momento.
                </div>
              ) : (
                filteredProcesses
                  .filter((process) => (process.requirements ?? []).length > 0)
                  .slice(0, 3)
                  .map((process) => (
                    <div
                      key={`req-${process.id}`}
                      className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4 text-sm text-slate-700"
                    >
                      <p className="truncate text-[14px] font-semibold leading-6 text-slate-900">
                        {process.protocol}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[14px] leading-6 text-slate-600">
                        {process.title}
                      </p>
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
              contentClassName="space-y-3"
            >
              {recentMovements.length === 0 ? (
                <div className="sig-dark-panel rounded-[10px] border border-dashed border-slate-300 p-4 text-[14px] leading-6 text-slate-600">
                  Nenhuma movimentação recente encontrada.
                </div>
              ) : (
                recentMovements.map((process) => (
                  <div
                    key={`recent-${process.id}`}
                    className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4 text-sm"
                  >
                    <p className="truncate text-[14px] font-semibold leading-6 text-slate-900">
                      {process.protocol}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[14px] leading-6 text-slate-600">
                      {process.title}
                    </p>
                    <p className="mt-2 text-[12px] uppercase tracking-[0.08em] text-slate-500">
                      Etapa: {process.sla?.currentStage || "Em andamento"}
                    </p>
                  </div>
                ))
              )}
            </SectionPanel>

            <SectionPanel
              title="Ações rápidas"
              description="Atalhos úteis para o fluxo diário do profissional."
              contentClassName="space-y-3"
            >
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl text-[14px]">
                <Link to="/externo/protocolar">Novo protocolo</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl text-[14px]">
                <Link to="/historico">Ver histórico</Link>
              </Button>
            </SectionPanel>
          </SideContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
  );
}