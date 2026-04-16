import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  LineChart,
  ShieldCheck,
  Timer,
  Users2,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageHero } from "@/components/platform/PageHero";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { MetricCard } from "@/components/platform/MetricCard";
import { SectionCard } from "@/components/platform/SectionCard";
import { TableCard } from "@/components/platform/TableCard";
import { EmptyState } from "@/components/platform/EmptyState";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { matchesOperationalScope, normalizeOwnerDocument, type ProcessRecord, type ProcessStatus } from "@/lib/platform";

const statusLabels: Record<ProcessStatus, string> = {
  rascunho: "Rascunho",
  triagem: "Triagem",
  pendencia_documental: "Pendência doc.",
  guia_emitida: "Guia emitida",
  pagamento_pendente: "Pagamento pendente",
  pagamento_confirmado: "Pagamento confirmado",
  distribuicao: "Distribuição",
  analise_tecnica: "Análise técnica",
  despacho_intersetorial: "Despacho",
  exigencia: "Exigência",
  reapresentacao: "Reapresentação",
  deferido: "Deferido",
  indeferido: "Indeferido",
  arquivado: "Arquivado",
};

function sumByStatus(processes: ProcessRecord[]) {
  const totals = new Map<ProcessStatus, number>();
  processes.forEach((process) => {
    totals.set(process.status, (totals.get(process.status) ?? 0) + 1);
  });
  return totals;
}

function buildStatusChart(processes: ProcessRecord[]) {
  const totals = sumByStatus(processes);
  return (Object.keys(statusLabels) as ProcessStatus[]).map((status) => ({
    status,
    label: statusLabels[status],
    total: totals.get(status) ?? 0,
  }));
}

function pickRecent(processes: ProcessRecord[], count = 5) {
  return [...processes]
    .sort((a, b) => b.timeline.length - a.timeline.length)
    .slice(0, count);
}

export function DashboardHomePage() {
  const { session } = usePlatformSession();
  const { processes, institutions, sessionUsers, getInstitutionSettings, getUserProfile } = usePlatformData();
  const { municipality, scopeId } = useMunicipality();
  const isMaster = session.role === "master_admin" || session.role === "master_ops";
  const isExternal = session.role === "profissional_externo" || session.role === "proprietario_consulta" || session.role === "property_owner";
  const isFinance = session.role === "financeiro";
  const isAnalyst = session.role === "analista" || session.role === "setor_intersetorial";

  const activeInstitutionId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantProcesses = useMemo(
    () => processes.filter((process) => matchesOperationalScope(activeInstitutionId, process)),
    [processes, activeInstitutionId],
  );
  const profile = getUserProfile(session.id, session.email);
  const ownerDocument = normalizeOwnerDocument(profile?.cpfCnpj || "");
  const externalProcesses = useMemo(
    () =>
      ownerDocument
        ? processes.filter((process) => normalizeOwnerDocument(process.ownerDocument) === ownerDocument)
        : [],
    [processes, ownerDocument],
  );

  const chartConfig = {
    total: { label: "Processos", color: "#60a5fa" },
  };

  const masterMetrics = useMemo(() => {
    const activeTenants = institutions.filter((tenant) => tenant.status === "ativo");
    const onboardingTenants = institutions.filter((tenant) => tenant.status === "implantacao");
    const monthlyRevenue = activeTenants.reduce(
      (sum, tenant) => sum + Number(getInstitutionSettings(tenant.id)?.monthlyFee ?? 0),
      0,
    );
    return {
      totalTenants: institutions.length,
      activeTenants: activeTenants.length,
      onboardingTenants: onboardingTenants.length,
      totalUsers: sessionUsers.length,
      totalProcesses: processes.length,
      monthlyRevenue,
    };
  }, [institutions, sessionUsers.length, processes.length, getInstitutionSettings]);

  const financeMetrics = useMemo(() => {
    const pending = tenantProcesses.filter((process) => process.status === "pagamento_pendente").length;
    const confirmed = tenantProcesses.filter((process) => process.status === "pagamento_confirmado").length;
    const issued = tenantProcesses.filter((process) => process.status === "guia_emitida").length;
    return { pending, confirmed, issued };
  }, [tenantProcesses]);

  const analystMetrics = useMemo(() => {
    const inReview = tenantProcesses.filter((process) => process.status === "analise_tecnica").length;
    const pendingDocs = tenantProcesses.filter((process) => process.status === "pendencia_documental").length;
    const requirements = tenantProcesses.filter((process) => process.status === "exigencia").length;
    return { inReview, pendingDocs, requirements };
  }, [tenantProcesses]);

  const tenantStatusChart = useMemo(() => buildStatusChart(tenantProcesses), [tenantProcesses]);
  const masterStatusChart = useMemo(() => buildStatusChart(processes), [processes]);

  const displayProcesses = isMaster ? processes : isExternal ? externalProcesses : tenantProcesses;
  const recentProcesses = pickRecent(displayProcesses, 6);

  const mainTitle = isMaster
    ? "Visão executiva da plataforma"
    : isExternal
      ? "Minha área de acompanhamento"
      : "Painel institucional da prefeitura";
  const heroDescription = isMaster
    ? "Indicadores estratégicos da plataforma, onboarding de clientes e saúde operacional."
    : isExternal
      ? "Status dos seus protocolos, pendências e movimentações recentes."
      : "Visão geral da operação da prefeitura, prazos e movimentações principais.";

  return (
    <PortalFrame eyebrow="DASHBOARD" title="Resumo institucional">
      <PageShell>
        <PageHero eyebrow="Resumo executivo" title={mainTitle} description={heroDescription} icon={LayoutDashboard} />

        <PageStatsRow className="xl:grid-cols-4">
          {isMaster ? (
            <>
              <MetricCard
                title="Prefeituras clientes"
                value={`${masterMetrics.totalTenants}`}
                helper="Total de municípios cadastrados na plataforma."
                icon={Building2}
                tone="blue"
              />
              <MetricCard
                title="Clientes ativos"
                value={`${masterMetrics.activeTenants}`}
                helper="Prefeituras em operação ativa."
                icon={ShieldCheck}
                tone="emerald"
              />
              <MetricCard
                title="Usuários na plataforma"
                value={`${masterMetrics.totalUsers}`}
                helper="Contas internas e externas em uso."
                icon={Users2}
                tone="default"
              />
              <MetricCard
                title="Receita recorrente"
                value={`R$ ${masterMetrics.monthlyRevenue.toFixed(2)}`}
                helper="Total mensal estimado pelos planos ativos."
                icon={Wallet}
                tone="amber"
              />
            </>
          ) : isExternal ? (
            <>
              <MetricCard
                title="Meus protocolos"
                value={`${externalProcesses.length}`}
                helper="Protocolos associados ao seu CPF/CNPJ."
                icon={FileText}
                tone="blue"
              />
              <MetricCard
                title="Pendências"
                value={`${externalProcesses.filter((process) => process.status === "exigencia").length}`}
                helper="Exigências aguardando resposta."
                icon={AlertTriangle}
                tone="rose"
              />
              <MetricCard
                title="Pagamentos pendentes"
                value={`${externalProcesses.filter((process) => process.status === "pagamento_pendente").length}`}
                helper="Guias emitidas aguardando compensação."
                icon={Wallet}
                tone="amber"
              />
              <MetricCard
                title="Protocolos concluídos"
                value={`${externalProcesses.filter((process) => process.status === "deferido").length}`}
                helper="Protocolos finalizados com sucesso."
                icon={CheckCircle2}
                tone="emerald"
              />
            </>
          ) : isFinance ? (
            <>
              <MetricCard
                title="Guias pendentes"
                value={`${financeMetrics.pending}`}
                helper="Protocolos com pagamento aguardando compensação."
                icon={AlertTriangle}
                tone="rose"
              />
              <MetricCard
                title="Guias emitidas"
                value={`${financeMetrics.issued}`}
                helper="Guias geradas e enviadas ao contribuinte."
                icon={Wallet}
                tone="amber"
              />
              <MetricCard
                title="Pagamentos confirmados"
                value={`${financeMetrics.confirmed}`}
                helper="Guias compensadas no sistema."
                icon={CheckCircle2}
                tone="emerald"
              />
              <MetricCard
                title="Protocolos ativos"
                value={`${tenantProcesses.length}`}
                helper="Total de processos em acompanhamento financeiro."
                icon={FileText}
                tone="blue"
              />
            </>
          ) : isAnalyst ? (
            <>
              <MetricCard
                title="Em análise"
                value={`${analystMetrics.inReview}`}
                helper="Processos aguardando parecer técnico."
                icon={Timer}
                tone="amber"
              />
              <MetricCard
                title="Pendências documentais"
                value={`${analystMetrics.pendingDocs}`}
                helper="Documentos em conferência documental."
                icon={AlertTriangle}
                tone="rose"
              />
              <MetricCard
                title="Exigências"
                value={`${analystMetrics.requirements}`}
                helper="Solicitações de ajuste em aberto."
                icon={Activity}
                tone="default"
              />
              <MetricCard
                title="Protocolos ativos"
                value={`${tenantProcesses.length}`}
                helper="Total em acompanhamento técnico."
                icon={FileText}
                tone="blue"
              />
            </>
          ) : (
            <>
              <MetricCard
                title="Protocolos ativos"
                value={`${tenantProcesses.length}`}
                helper="Processos registrados para a prefeitura atual."
                icon={FileText}
                tone="blue"
              />
              <MetricCard
                title="Em análise"
                value={`${tenantProcesses.filter((process) => process.status === "analise_tecnica").length}`}
                helper="Processos aguardando parecer técnico."
                icon={Timer}
                tone="amber"
              />
              <MetricCard
                title="Exigências"
                value={`${tenantProcesses.filter((process) => process.status === "exigencia").length}`}
                helper="Pendências documentais em aberto."
                icon={AlertTriangle}
                tone="rose"
              />
              <MetricCard
                title="Concluídos"
                value={`${tenantProcesses.filter((process) => process.status === "deferido").length}`}
                helper="Processos deferidos concluídos."
                icon={CheckCircle2}
                tone="emerald"
              />
            </>
          )}
        </PageStatsRow>

        <PageMainGrid>
          <PageMainContent>
            <TableCard
              title="Evolução dos processos"
              description="Distribuição dos processos por etapa atual."
              icon={BarChart3}
            >
              {displayProcesses.length === 0 ? (
                <EmptyState
                  title="Nenhum processo disponível"
                  description="Não existem processos registrados para este perfil no momento."
                  icon={AlertTriangle}
                />
              ) : (
                <div className="h-[260px]">
                  <ChartContainer config={chartConfig} className="h-full w-full">
                    <BarChart data={isMaster ? masterStatusChart : tenantStatusChart}>
                      <defs>
                        <linearGradient id="sigapro-dashboard-bar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7dd3fc" />
                          <stop offset="55%" stopColor="#60a5fa" />
                          <stop offset="100%" stopColor="#2563eb" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 8" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} minTickGap={10} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={10} width={30} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} cursor={false} />
                      <Bar dataKey="total" fill="url(#sigapro-dashboard-bar)" radius={[10, 10, 0, 0]} maxBarSize={34} />
                    </BarChart>
                  </ChartContainer>
                </div>
              )}
            </TableCard>
          </PageMainContent>

          <PageSideContent>
            <SectionCard title="Movimentações recentes" description="Últimos processos movimentados no seu escopo." icon={Activity}>
              {recentProcesses.length === 0 ? (
                <EmptyState
                  title="Sem movimentações recentes"
                  description="Quando houver ações nos processos, elas aparecerão aqui."
                  icon={LineChart}
                />
              ) : (
                <div className="space-y-3">
                  {recentProcesses.map((process) => (
                    <div key={process.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{process.protocol}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{process.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{statusLabels[process.status] ?? process.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </PageSideContent>
        </PageMainGrid>
      </PageShell>
    </PortalFrame>
  );
}
