import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  LayoutDashboard,
  LineChart as LineChartIcon,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Users2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { PageHero } from "@/components/platform/PageHero";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { MetricCard } from "@/components/platform/MetricCard";
import { SectionCard } from "@/components/platform/SectionCard";
import { TableCard } from "@/components/platform/TableCard";
import { EmptyState } from "@/components/platform/EmptyState";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { matchesOperationalScope, normalizeOwnerDocument, type ProcessRecord, type ProcessStatus, type SessionUser } from "@/lib/platform";

const statusLabels: Record<ProcessStatus, string> = {
  rascunho: "Rascunho",
  triagem: "Triagem",
  pendencia_documental: "Pendencia documental",
  guia_emitida: "Guia emitida",
  pagamento_pendente: "Pagamento pendente",
  pagamento_confirmado: "Pagamento confirmado",
  distribuicao: "Distribuicao",
  analise_tecnica: "Analise tecnica",
  despacho_intersetorial: "Despacho",
  exigencia: "Exigencia",
  reapresentacao: "Reapresentacao",
  deferido: "Deferido",
  indeferido: "Indeferido",
  arquivado: "Arquivado",
};

const roleLabels: Record<string, string> = {
  master_admin: "Administrador master",
  master_ops: "Operacao master",
  prefeitura_admin: "Administrador da prefeitura",
  prefeitura_supervisor: "Supervisor da prefeitura",
  analista: "Analista",
  financeiro: "Financeiro",
  setor_intersetorial: "Intersetorial",
  fiscal: "Fiscal",
  profissional_externo: "Profissional externo",
  property_owner: "Proprietario",
  proprietario_consulta: "Consulta do proprietario",
};

const completedStatuses = new Set<ProcessStatus>(["deferido", "indeferido", "arquivado"]);
const attentionStatuses = new Set<ProcessStatus>(["pendencia_documental", "exigencia", "pagamento_pendente"]);
const financeStatuses = new Set<ProcessStatus>(["guia_emitida", "pagamento_pendente", "pagamento_confirmado"]);
const accentPalette = ["#60a5fa", "#34d399", "#fbbf24", "#fb7185", "#818cf8", "#22d3ee", "#f97316"];

function parsePlatformDate(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const iso = new Date(trimmed);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  const match = trimmed.match(
    /^(?<day>\d{2})\/(?<month>\d{2})\/(?<year>\d{4})(?:\s+(?<hour>\d{2}):(?<minute>\d{2}))?$/,
  );
  if (!match?.groups) return null;

  const result = new Date(
    Number(match.groups.year),
    Number(match.groups.month) - 1,
    Number(match.groups.day),
    Number(match.groups.hour ?? "0"),
    Number(match.groups.minute ?? "0"),
  );
  return Number.isNaN(result.getTime()) ? null : result;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

function buildStatusChart(processes: ProcessRecord[]) {
  const totals = new Map<ProcessStatus, number>();
  processes.forEach((process) => totals.set(process.status, (totals.get(process.status) ?? 0) + 1));

  return (Object.keys(statusLabels) as ProcessStatus[])
    .map((status) => ({
      status,
      label: statusLabels[status],
      total: totals.get(status) ?? 0,
    }))
    .filter((item) => item.total > 0);
}

function buildGroupChart(values: string[], limit = 6) {
  const totals = new Map<string, number>();
  values.forEach((value) => {
    const label = value?.trim() || "Nao informado";
    totals.set(label, (totals.get(label) ?? 0) + 1);
  });

  return Array.from(totals.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function buildTenantVolumeChart(processes: ProcessRecord[], institutions: Array<{ id: string; name: string }>) {
  const names = new Map(institutions.map((institution) => [institution.id, institution.name]));
  return buildGroupChart(processes.map((process) => names.get(process.tenantId) ?? "Nao identificado"));
}

function buildActivitySeries(processes: ProcessRecord[], days = 7) {
  const now = new Date();
  const buckets = Array.from({ length: days }, (_, index) => {
    const current = new Date(now);
    current.setDate(now.getDate() - (days - index - 1));
    current.setHours(0, 0, 0, 0);
    return {
      key: current.toISOString().slice(0, 10),
      label: formatCompactDate(current),
      total: 0,
    };
  });

  const bucketMap = new Map(buckets.map((item) => [item.key, item]));
  processes.forEach((process) => {
    process.timeline.forEach((entry) => {
      const date = parsePlatformDate(entry.at);
      if (!date) return;
      date.setHours(0, 0, 0, 0);
      const key = date.toISOString().slice(0, 10);
      const bucket = bucketMap.get(key);
      if (bucket) bucket.total += 1;
    });
  });

  return buckets;
}

function getOpenRequirements(process: ProcessRecord) {
  return process.requirements.filter((item) => item.status === "aberta" || item.status === "respondida").length;
}

function getLatestMovement(process: ProcessRecord) {
  return process.timeline[0]?.title || process.auditTrail[0]?.title || process.messages[0]?.message || "Sem movimentacao recente";
}

function getLatestMovementDate(process: ProcessRecord) {
  return process.timeline[0]?.at || process.auditTrail[0]?.at || process.messages[0]?.at || process.payment.dueDate || "";
}

function pickRecent(processes: ProcessRecord[], count = 6) {
  const getLatestMoment = (process: ProcessRecord) =>
    [
      process.timeline[0]?.at,
      process.auditTrail[0]?.at,
      process.messages[0]?.at,
      process.payment.issuedAt,
      process.payment.dueDate,
    ]
      .map((value) => parsePlatformDate(value))
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0]?.getTime() ?? 0;

  return [...processes].sort((a, b) => getLatestMoment(b) - getLatestMoment(a)).slice(0, count);
}

function buildPriorityScore(process: ProcessRecord) {
  let score = 0;
  if (process.sla.breached) score += 5;
  if (process.processControl?.onHold) score += 4;
  if (attentionStatuses.has(process.status)) score += 3;
  if (getOpenRequirements(process) > 0) score += 2;
  if ((process.dispatches[0]?.priority ?? "baixa") === "critica") score += 2;
  if ((process.dispatches[0]?.priority ?? "baixa") === "alta") score += 1;
  return score;
}

function buildPriorityReason(process: ProcessRecord) {
  if (process.sla.breached) return "SLA vencido";
  if (process.processControl?.onHold) return "Fluxo sobrestado";
  if (process.status === "pagamento_pendente") return "Pagamento aguardando compensacao";
  if (process.status === "pendencia_documental") return "Documentacao pendente";
  if (process.status === "exigencia") return "Exigencia em aberto";
  if (getOpenRequirements(process) > 0) return `${getOpenRequirements(process)} pendencia(s) formal(is)`;
  return statusLabels[process.status] ?? process.status;
}

function buildHealthSignals(processes: ProcessRecord[]) {
  const total = processes.length || 1;
  const breached = processes.filter((process) => process.sla.breached).length;
  const dueSoon = processes.filter(
    (process) => !process.sla.breached && process.sla.hoursRemaining > 0 && process.sla.hoursRemaining <= 24,
  ).length;
  const withRequirements = processes.filter((process) => getOpenRequirements(process) > 0).length;
  const onHold = processes.filter((process) => process.processControl?.onHold).length;

  return [
    { label: "Dentro do prazo", value: total - breached, total, tone: "emerald" as const },
    { label: "Risco de atraso", value: dueSoon, total, tone: "amber" as const },
    { label: "Exigem acao", value: withRequirements, total, tone: "rose" as const },
    { label: "Sobrestados", value: onHold, total, tone: "blue" as const },
  ];
}

function buildRoleChart(users: SessionUser[]) {
  return buildGroupChart(users.map((user) => roleLabels[user.role] ?? user.role), 6);
}

function ExecutiveSignal({
  label,
  value,
  helper,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "blue" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    blue: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
    rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
  };

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:border-white/12 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">{label}</p>
          <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">{value}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-300">{helper}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border shadow-[0_10px_20px_rgba(15,23,42,0.08)] ${tones[tone]}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}

function HealthBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "blue" | "emerald" | "amber" | "rose";
}) {
  const percentage = total === 0 ? 0 : Math.min(100, Math.round((value / total) * 100));
  const barClass =
    tone === "emerald"
      ? "from-emerald-400 to-emerald-500"
      : tone === "amber"
        ? "from-amber-300 to-amber-500"
        : tone === "rose"
          ? "from-rose-400 to-rose-500"
          : "from-sky-400 to-sky-500";

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-100">{label}</p>
        <p className="text-sm font-semibold text-slate-950 dark:text-white">
          {value}
          <span className="ml-1 text-slate-400 dark:text-slate-400">/ {total}</span>
        </p>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10">
        <div className={`h-2 rounded-full bg-gradient-to-r ${barClass}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function DistributionCard({
  title,
  description,
  icon,
  data,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  data: Array<{ label: string; total: number }>;
}) {
  const chartConfig = { total: { label: "Volume", color: "#60a5fa" } };

  return (
    <TableCard title={title} description={description} icon={icon}>
      {data.length === 0 ? (
        <EmptyState title="Sem dados para distribuicao" description="Assim que houver volume suficiente, o grafico sera preenchido automaticamente." icon={AlertTriangle} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(220px,0.8fr)] lg:items-center">
          <div className="h-[260px]">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <PieChart>
                <Pie data={data} dataKey="total" nameKey="label" innerRadius={64} outerRadius={96} paddingAngle={3}>
                  {data.map((entry, index) => (
                    <Cell key={entry.label} fill={accentPalette[index % accentPalette.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent hideLabel indicator="dot" />} cursor={false} />
              </PieChart>
            </ChartContainer>
          </div>
          <div className="space-y-3">
            {data.map((item, index) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: accentPalette[index % accentPalette.length] }} />
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-100">{item.label}</p>
                </div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">{item.total}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </TableCard>
  );
}

export function DashboardHomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const { processes, institutions, sessionUsers, getInstitutionSettings, getUserProfile } = usePlatformData();
  const { municipality, scopeId } = useMunicipality();
  const isMaster = session.role === "master_admin" || session.role === "master_ops";
  const isExternal = session.role === "profissional_externo" || session.role === "proprietario_consulta" || session.role === "property_owner";
  const isFinance = session.role === "financeiro";
  const isAnalyst = session.role === "analista" || session.role === "setor_intersetorial";

  const activeInstitutionId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const profile = getUserProfile(session.id, session.email);
  const ownerDocument = normalizeOwnerDocument(profile?.cpfCnpj || "");

  const tenantProcesses = useMemo(
    () => processes.filter((process) => matchesOperationalScope(activeInstitutionId, process)),
    [processes, activeInstitutionId],
  );

  const externalProcesses = useMemo(
    () => (ownerDocument ? processes.filter((process) => normalizeOwnerDocument(process.ownerDocument) === ownerDocument) : []),
    [processes, ownerDocument],
  );

  const scopedUsers = useMemo(
    () => (isMaster ? sessionUsers : sessionUsers.filter((user) => user.tenantId === activeInstitutionId)),
    [isMaster, sessionUsers, activeInstitutionId],
  );

  const displayProcesses = isMaster ? processes : isExternal ? externalProcesses : tenantProcesses;
  const institutionName =
    municipality?.name || institutions.find((institution) => institution.id === activeInstitutionId)?.name || "SIGAPRO";

  const completedCount = displayProcesses.filter((process) => completedStatuses.has(process.status)).length;
  const inProgressCount = displayProcesses.length - completedCount;
  const breachedCount = displayProcesses.filter((process) => process.sla.breached).length;
  const pendingPayments = displayProcesses.filter((process) => process.payment.status === "pendente" && financeStatuses.has(process.status)).length;
  const openRequirements = displayProcesses.filter((process) => getOpenRequirements(process) > 0).length;
  const totalMessages = displayProcesses.reduce((sum, process) => sum + process.messages.length, 0);
  const totalDispatches = displayProcesses.reduce((sum, process) => sum + process.dispatches.length, 0);
  const paymentVolume = displayProcesses.reduce((sum, process) => sum + Number(process.payment.amount || 0), 0);
  const totalGuides = displayProcesses.reduce((sum, process) => sum + (process.payment.guides?.length ?? 0), 0);
  const averageTimelineDepth =
    displayProcesses.length === 0
      ? 0
      : Math.round(displayProcesses.reduce((sum, process) => sum + process.timeline.length, 0) / displayProcesses.length);

  const activeUsers = scopedUsers.filter((user) => user.accountStatus === "active").length;
  const blockedUsers = scopedUsers.filter((user) => user.accountStatus === "blocked").length;
  const adminUsers = scopedUsers.filter((user) => user.role === "master_admin" || user.role === "prefeitura_admin").length;

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
      monthlyRevenue,
    };
  }, [institutions, sessionUsers.length, getInstitutionSettings]);

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

  const statusChart = useMemo(() => buildStatusChart(displayProcesses), [displayProcesses]);
  const activitySeries = useMemo(() => buildActivitySeries(displayProcesses), [displayProcesses]);
  const typeChart = useMemo(() => buildGroupChart(displayProcesses.map((process) => process.type), 6), [displayProcesses]);
  const stageChart = useMemo(() => buildGroupChart(displayProcesses.map((process) => process.sla.currentStage), 6), [displayProcesses]);
  const tenantVolumeChart = useMemo(() => buildTenantVolumeChart(processes, institutions), [processes, institutions]);
  const healthSignals = useMemo(() => buildHealthSignals(displayProcesses), [displayProcesses]);
  const recentProcesses = useMemo(() => pickRecent(displayProcesses, 6), [displayProcesses]);
  const priorityProcesses = useMemo(
    () =>
      [...displayProcesses]
        .sort((a, b) => buildPriorityScore(b) - buildPriorityScore(a))
        .filter((process) => buildPriorityScore(process) > 0)
        .slice(0, 6),
    [displayProcesses],
  );
  const roleChart = useMemo(() => buildRoleChart(scopedUsers), [scopedUsers]);
  const accountStatusChart = useMemo(
    () =>
      [
        { label: "Ativos", total: activeUsers },
        { label: "Bloqueados", total: blockedUsers },
        { label: "Inativos", total: Math.max(scopedUsers.length - activeUsers - blockedUsers, 0) },
      ].filter((item) => item.total > 0),
    [scopedUsers.length, activeUsers, blockedUsers],
  );
  const financeSituationChart = useMemo(
    () =>
      [
        { label: "Pendentes", total: displayProcesses.filter((process) => process.status === "pagamento_pendente").length },
        { label: "Emitidas", total: displayProcesses.filter((process) => process.status === "guia_emitida").length },
        { label: "Compensadas", total: displayProcesses.filter((process) => process.status === "pagamento_confirmado").length },
      ].filter((item) => item.total > 0),
    [displayProcesses],
  );

  const chartConfig = { total: { label: "Volume", color: "#60a5fa" } };

  const section = location.pathname.startsWith("/dashboard/processos")
    ? "processos"
    : location.pathname.startsWith("/dashboard/financeiro")
      ? "financeiro"
      : location.pathname.startsWith("/dashboard/usuarios")
        ? "usuarios"
        : location.pathname.startsWith("/dashboard/operacional")
          ? "operacional"
          : "visao-geral";

  const tabs = [
    { value: "/dashboard", label: "Visao geral", helper: "Resumo executivo" },
    { value: "/dashboard/processos", label: "Processos", helper: "Fluxo e distribuicao" },
    { value: "/dashboard/financeiro", label: "Financeiro", helper: "Guias e compensacoes" },
    ...(!isExternal ? [{ value: "/dashboard/operacional", label: "Operacional", helper: "SLA e prioridades" }] : []),
    ...((isMaster || (!isExternal && !isFinance)) ? [{ value: "/dashboard/usuarios", label: "Usuarios", helper: "Governanca e acessos" }] : []),
  ];

  const headlineTitle = isMaster
    ? "Dashboard executivo da plataforma"
    : isExternal
      ? "Acompanhamento da sua carteira"
      : isFinance
        ? "Painel financeiro institucional"
        : isAnalyst
          ? "Painel tatico de analise"
          : "Dashboard institucional da prefeitura";

  const headlineDescription = isMaster
    ? "A home executiva agora distribui a inteligencia do sistema em modulos proprios, com leitura estrategica mais limpa e escalavel."
    : isExternal
      ? "Acompanhe seu universo de protocolos em uma home mais objetiva e navegue por paines especializados."
      : isFinance
        ? "A home resume o essencial e abre caminho para modulos proprios de financeiro, processos e operacao."
        : isAnalyst
          ? "A estrutura modular organiza a leitura tecnica, os riscos e a produtividade em paineis mais claros."
          : "A nova experiencia organiza o dashboard por contexto, com home executiva e subareas analiticas mais profissionais.";

  const executiveSignals = isMaster
    ? [
        {
          label: "Rede ativa",
          value: `${masterMetrics.activeTenants}/${masterMetrics.totalTenants}`,
          helper: "Prefeituras em operacao ativa na base.",
          icon: Building2,
          tone: "blue" as const,
        },
        {
          label: "Clientes em implantacao",
          value: `${masterMetrics.onboardingTenants}`,
          helper: "Contas em onboarding e homologacao.",
          icon: Sparkles,
          tone: "amber" as const,
        },
        {
          label: "Usuarios monitorados",
          value: `${masterMetrics.totalUsers}`,
          helper: "Contas internas e externas com atividade.",
          icon: Users2,
          tone: "emerald" as const,
        },
        {
          label: "Receita recorrente",
          value: formatCurrency(masterMetrics.monthlyRevenue),
          helper: "Estimativa mensal baseada em planos ativos.",
          icon: Wallet,
          tone: "rose" as const,
        },
      ]
    : [
        {
          label: isExternal ? "Carteira em acompanhamento" : "Escopo monitorado",
          value: `${displayProcesses.length}`,
          helper: isExternal ? "Protocolos vinculados ao seu documento." : `Processos visiveis em ${institutionName}.`,
          icon: FileText,
          tone: "blue" as const,
        },
        {
          label: "Concluidos",
          value: `${completedCount}`,
          helper: "Protocolos encerrados ou finalizados.",
          icon: CheckCircle2,
          tone: "emerald" as const,
        },
        {
          label: "Risco de prazo",
          value: `${breachedCount}`,
          helper: "Processos com SLA vencido.",
          icon: Timer,
          tone: "amber" as const,
        },
        {
          label: isFinance ? "Exposicao financeira" : "Pendencias ativas",
          value: isFinance ? formatCurrency(paymentVolume) : `${openRequirements + pendingPayments}`,
          helper: isFinance ? "Montante financeiro do recorte atual." : "Itens que exigem retorno, comprovacao ou ajuste.",
          icon: isFinance ? Wallet : AlertTriangle,
          tone: "rose" as const,
        },
      ];

  const heroActions = (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="rounded-full" onClick={() => navigate("/dashboard/processos")}>
        Ver processos
      </Button>
      <Button type="button" className="rounded-full bg-slate-950 hover:bg-slate-900 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400" onClick={() => navigate("/dashboard/operacional")}>
        Abrir leitura operacional
      </Button>
    </div>
  );

  const overviewMetrics = isMaster
    ? [
        { title: "Prefeituras clientes", value: `${masterMetrics.totalTenants}`, helper: "Total de municipios cadastrados.", icon: Building2, tone: "blue" as const },
        { title: "Clientes ativos", value: `${masterMetrics.activeTenants}`, helper: "Prefeituras em operacao ativa.", icon: ShieldCheck, tone: "emerald" as const },
        { title: "Usuarios na plataforma", value: `${masterMetrics.totalUsers}`, helper: "Contas internas e externas em uso.", icon: Users2, tone: "default" as const },
        { title: "Processos monitorados", value: `${processes.length}`, helper: "Volume global consolidado da base.", icon: FileText, tone: "amber" as const },
      ]
    : isExternal
      ? [
          { title: "Meus protocolos", value: `${externalProcesses.length}`, helper: "Protocolos associados ao seu CPF/CNPJ.", icon: FileText, tone: "blue" as const },
          { title: "Pendencias", value: `${openRequirements}`, helper: "Exigencias aguardando retorno.", icon: AlertTriangle, tone: "rose" as const },
          { title: "Pagamentos pendentes", value: `${pendingPayments}`, helper: "Guias aguardando compensacao.", icon: Wallet, tone: "amber" as const },
          { title: "Protocolos concluidos", value: `${completedCount}`, helper: "Processos finalizados no historico.", icon: CheckCircle2, tone: "emerald" as const },
        ]
      : isFinance
        ? [
            { title: "Guias pendentes", value: `${financeMetrics.pending}`, helper: "Aguardando compensacao.", icon: AlertTriangle, tone: "rose" as const },
            { title: "Guias emitidas", value: `${financeMetrics.issued}`, helper: "Guias geradas para contribuinte.", icon: Wallet, tone: "amber" as const },
            { title: "Pagamentos confirmados", value: `${financeMetrics.confirmed}`, helper: "Guias compensadas no sistema.", icon: CheckCircle2, tone: "emerald" as const },
            { title: "Volume financeiro", value: formatCurrency(paymentVolume), helper: "Montante financeiro do recorte.", icon: TrendingUp, tone: "blue" as const },
          ]
        : isAnalyst
          ? [
              { title: "Em analise", value: `${analystMetrics.inReview}`, helper: "Processos aguardando parecer.", icon: Timer, tone: "amber" as const },
              { title: "Pendencias documentais", value: `${analystMetrics.pendingDocs}`, helper: "Documentos em conferencia.", icon: AlertTriangle, tone: "rose" as const },
              { title: "Exigencias", value: `${analystMetrics.requirements}`, helper: "Solicitacoes de ajuste em aberto.", icon: Activity, tone: "default" as const },
              { title: "Carga ativa", value: `${inProgressCount}`, helper: "Volume total em acompanhamento.", icon: FileText, tone: "blue" as const },
            ]
          : [
              { title: "Protocolos ativos", value: `${inProgressCount}`, helper: "Processos em acompanhamento na prefeitura.", icon: FileText, tone: "blue" as const },
              { title: "Em analise", value: `${displayProcesses.filter((process) => process.status === "analise_tecnica").length}`, helper: "Processos aguardando parecer tecnico.", icon: Timer, tone: "amber" as const },
              { title: "Exigencias", value: `${displayProcesses.filter((process) => process.status === "exigencia").length}`, helper: "Pendencias em aberto.", icon: AlertTriangle, tone: "rose" as const },
              { title: "Concluidos", value: `${completedCount}`, helper: "Processos finalizados ou encerrados.", icon: CheckCircle2, tone: "emerald" as const },
            ];

  const renderOverview = () => (
    <>
      <SectionCard
        title="Panorama estrategico"
        description={isMaster ? "Leitura consolidada da operacao SaaS, da base de clientes e da saude da plataforma." : `Resumo executivo do escopo atual em ${institutionName}, com foco em performance, risco e leitura institucional.`}
        icon={Sparkles}
        contentClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {executiveSignals.map((item) => (
          <ExecutiveSignal key={item.label} {...item} />
        ))}
      </SectionCard>

      <PageStatsRow className="xl:grid-cols-4">
        {overviewMetrics.map((item) => (
          <MetricCard key={item.title} {...item} />
        ))}
      </PageStatsRow>

      <PageMainGrid className="min-[1480px]:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.92fr)] min-[1680px]:grid-cols-[minmax(0,1.52fr)_minmax(390px,0.95fr)]">
        <PageMainContent>
          <TableCard
            title={isExternal ? "Ritmo recente da sua carteira" : "Ritmo operacional recente"}
            description={isExternal ? "Movimentacoes registradas nos ultimos dias dentro dos seus protocolos." : "Evolucao recente das movimentacoes registradas no recorte atual."}
            icon={LineChartIcon}
          >
            {activitySeries.every((item) => item.total === 0) ? (
              <EmptyState title="Sem atividade recente" description="Quando houver novas movimentacoes, o painel temporal sera preenchido automaticamente." icon={Activity} />
            ) : (
              <div className="h-[300px]">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <AreaChart data={activitySeries} margin={{ left: 2, right: 8, top: 12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sigapro-dashboard-area-overview" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.42} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 8" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={10} width={28} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} cursor={false} />
                    <Area type="monotone" dataKey="total" stroke="#60a5fa" strokeWidth={3} fill="url(#sigapro-dashboard-area-overview)" activeDot={{ r: 5, fill: "#93c5fd" }} />
                  </AreaChart>
                </ChartContainer>
              </div>
            )}
          </TableCard>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <DistributionCard
              title="Distribuicao por status"
              description="Leitura sintetica do volume atual por etapa do fluxo."
              icon={BarChart3}
              data={statusChart}
            />
            <DistributionCard
              title={isMaster ? "Volume por prefeitura" : "Distribuicao por tipo"}
              description={isMaster ? "Clientes com maior concentracao de processos." : "Tipos de processo mais representativos no recorte atual."}
              icon={TrendingUp}
              data={isMaster ? tenantVolumeChart : typeChart}
            />
          </div>
        </PageMainContent>

        <PageSideContent>
          <SectionCard
            title="Saude operacional"
            description="Leitura rapida de risco, prazo e equilibrio da carteira atual."
            icon={Activity}
            contentClassName="space-y-4"
          >
            {healthSignals.map((signal) => (
              <HealthBar key={signal.label} {...signal} />
            ))}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <ExecutiveSignal
                label="Profundidade media"
                value={`${averageTimelineDepth}`}
                helper="Eventos registrados por processo no universo visivel."
                icon={Clock3}
                tone="blue"
              />
              <ExecutiveSignal
                label="Interacoes totais"
                value={`${totalMessages + totalDispatches + totalGuides}`}
                helper="Mensagens, despachos e guias registrados no recorte."
                icon={Activity}
                tone="emerald"
              />
            </div>
          </SectionCard>

          <SectionCard
            title={isExternal ? "Protocolos que exigem sua acao" : "Prioridades do dia"}
            description={isExternal ? "Itens que pedem retorno, comprovacao ou acompanhamento imediato." : "Processos que concentram risco, prazo ou criticidade operacional."}
            icon={AlertTriangle}
          >
            {priorityProcesses.length === 0 ? (
              <EmptyState title="Nenhuma prioridade critica" description="A carteira atual nao apresenta itens com risco imediato." icon={CheckCircle2} />
            ) : (
              <div className="space-y-3">
                {priorityProcesses.map((process) => (
                  <div key={process.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/85 p-4 dark:border-white/12 dark:bg-white/[0.04]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">{process.protocol}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{process.title}</p>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{buildPriorityReason(process)}</p>
                      </div>
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white dark:bg-sky-400/12 dark:text-sky-200">
                        {statusLabels[process.status] ?? process.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </PageSideContent>
      </PageMainGrid>
    </>
  );

  const renderProcesses = () => (
    <div className="space-y-6">
      <PageStatsRow className="xl:grid-cols-4">
        <MetricCard title="Em andamento" value={`${inProgressCount}`} helper="Processos ativos no fluxo atual." icon={FileText} tone="blue" />
        <MetricCard title="Concluidos" value={`${completedCount}`} helper="Protocolos encerrados no recorte." icon={CheckCircle2} tone="emerald" />
        <MetricCard title="Exigencias" value={`${displayProcesses.filter((process) => process.status === "exigencia").length}`} helper="Itens em exigencia formal." icon={AlertTriangle} tone="rose" />
        <MetricCard title="Reapresentacao" value={`${displayProcesses.filter((process) => process.status === "reapresentacao").length}`} helper="Protocolos retornados para nova submissao." icon={ArrowRight} tone="amber" />
      </PageStatsRow>

      <PageMainGrid className="min-[1480px]:grid-cols-[minmax(0,1.38fr)_minmax(360px,0.92fr)]">
        <PageMainContent>
          <div className="grid gap-6 xl:grid-cols-2">
            <DistributionCard title="Distribuicao por status" description="Volume atual por etapa macro do fluxo processual." icon={BarChart3} data={statusChart} />
            <DistributionCard title="Distribuicao por tipo" description="Tipos mais frequentes na operacao atual." icon={LayoutDashboard} data={typeChart} />
          </div>

          <TableCard title="Evolucao de movimentacoes" description="Ritmo recente da carteira de processos no escopo atual." icon={LineChartIcon}>
            {activitySeries.every((item) => item.total === 0) ? (
              <EmptyState title="Sem evolucao registrada" description="Ainda nao ha eventos suficientes para compor a leitura temporal." icon={Activity} />
            ) : (
              <div className="h-[320px]">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <AreaChart data={activitySeries} margin={{ left: 2, right: 8, top: 12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sigapro-dashboard-area-processes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.36} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 8" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={10} width={28} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} cursor={false} />
                    <Area type="monotone" dataKey="total" stroke="#34d399" strokeWidth={3} fill="url(#sigapro-dashboard-area-processes)" activeDot={{ r: 5, fill: "#86efac" }} />
                  </AreaChart>
                </ChartContainer>
              </div>
            )}
          </TableCard>
        </PageMainContent>

        <PageSideContent>
          <DistributionCard title="Concentracao por etapa critica" description="Etapas com maior peso no fluxo atual." icon={Timer} data={stageChart} />
          <SectionCard title="Movimentacoes recentes" description="Protocolos com atualizacoes mais recentes no escopo." icon={Activity}>
            {recentProcesses.length === 0 ? (
              <EmptyState title="Sem movimentacoes recentes" description="A lista sera preenchida conforme novos eventos forem registrados." icon={LineChartIcon} />
            ) : (
              <div className="space-y-3">
                {recentProcesses.map((process) => (
                  <div key={process.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/85 p-4 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">{process.protocol}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{process.title}</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{getLatestMovement(process)}</p>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-400">{getLatestMovementDate(process)}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </PageSideContent>
      </PageMainGrid>
    </div>
  );

  const renderFinance = () => (
    <div className="space-y-6">
      <PageStatsRow className="xl:grid-cols-4">
        <MetricCard title="Guias emitidas" value={`${displayProcesses.filter((process) => process.status === "guia_emitida").length}`} helper="Guias geradas no recorte atual." icon={Wallet} tone="amber" />
        <MetricCard title="Pagamentos pendentes" value={`${pendingPayments}`} helper="Aguardando compensacao no sistema." icon={AlertTriangle} tone="rose" />
        <MetricCard title="Pagamentos confirmados" value={`${displayProcesses.filter((process) => process.status === "pagamento_confirmado").length}`} helper="Guias compensadas e registradas." icon={CheckCircle2} tone="emerald" />
        <MetricCard title="Volume financeiro" value={formatCurrency(paymentVolume)} helper="Montante financeiro total monitorado." icon={TrendingUp} tone="blue" />
      </PageStatsRow>

      <PageMainGrid className="min-[1480px]:grid-cols-[minmax(0,1.28fr)_minmax(360px,0.98fr)]">
        <PageMainContent>
          <div className="grid gap-6 xl:grid-cols-2">
            <DistributionCard title="Situacao financeira" description="Comparativo entre guias emitidas, pendentes e compensadas." icon={Wallet} data={financeSituationChart} />
            <TableCard title="Comparativo de guias" description="Volume financeiro por situacao do fluxo de arrecadacao." icon={BarChart3}>
              {financeSituationChart.length === 0 ? (
                <EmptyState title="Sem informacoes financeiras" description="Nao ha guias suficientes para compor o painel comparativo." icon={Wallet} />
              ) : (
                <div className="h-[300px]">
                  <ChartContainer config={chartConfig} className="h-full w-full">
                    <BarChart data={financeSituationChart} margin={{ left: 6, right: 6, top: 12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 8" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} minTickGap={10} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={10} width={30} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} cursor={false} />
                      <Bar dataKey="total" radius={[10, 10, 0, 0]} maxBarSize={38}>
                        {financeSituationChart.map((entry, index) => (
                          <Cell key={entry.label} fill={accentPalette[index % accentPalette.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </div>
              )}
            </TableCard>
          </div>
        </PageMainContent>

        <PageSideContent>
          <SectionCard title="Resumo financeiro" description="Leitura executiva da carteira financeira atual." icon={ShieldCheck} contentClassName="space-y-4">
            <ExecutiveSignal label="Montante sob gestao" value={formatCurrency(paymentVolume)} helper="Total financeiro consolidado no universo visivel." icon={Wallet} tone="blue" />
            <ExecutiveSignal label="Guias monitoradas" value={`${totalGuides}`} helper="Somatorio de guias registradas nos processos." icon={FileText} tone="amber" />
            <ExecutiveSignal label="Pendencias de compensacao" value={`${pendingPayments}`} helper="Protocolos ainda aguardando baixa bancaria." icon={AlertTriangle} tone="rose" />
          </SectionCard>
          <SectionCard title="Itens com prioridade financeira" description="Protocolos que exigem acao ou acompanhamento financeiro." icon={AlertTriangle}>
            {priorityProcesses.filter((process) => financeStatuses.has(process.status)).length === 0 ? (
              <EmptyState title="Sem itens financeiros criticos" description="Nao ha processos financeiros com criticidade imediata." icon={CheckCircle2} />
            ) : (
              <div className="space-y-3">
                {priorityProcesses
                  .filter((process) => financeStatuses.has(process.status))
                  .map((process) => (
                    <div key={process.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/85 p-4 dark:border-white/12 dark:bg-white/[0.04]">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">{process.protocol}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{process.title}</p>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{buildPriorityReason(process)}</p>
                    </div>
                  ))}
              </div>
            )}
          </SectionCard>
        </PageSideContent>
      </PageMainGrid>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-6">
      <PageStatsRow className="xl:grid-cols-4">
        <MetricCard title="Usuarios monitorados" value={`${scopedUsers.length}`} helper="Contas disponiveis no escopo atual." icon={Users2} tone="blue" />
        <MetricCard title="Ativos" value={`${activeUsers}`} helper="Usuarios com conta ativa." icon={ShieldCheck} tone="emerald" />
        <MetricCard title="Bloqueados" value={`${blockedUsers}`} helper="Contas com restricao operacional." icon={AlertTriangle} tone="rose" />
        <MetricCard title="Administradores" value={`${adminUsers}`} helper="Perfis com governanca elevada." icon={Building2} tone="amber" />
      </PageStatsRow>

      <PageMainGrid className="min-[1480px]:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
        <PageMainContent>
          <div className="grid gap-6 xl:grid-cols-2">
            <DistributionCard title="Distribuicao por perfil" description="Leitura dos perfis mais relevantes no recorte atual." icon={Users2} data={roleChart} />
            <DistributionCard title="Situacao das contas" description="Usuarios ativos, bloqueados e inativos no escopo atual." icon={ShieldCheck} data={accountStatusChart} />
          </div>
        </PageMainContent>

        <PageSideContent>
          <SectionCard title="Governanca de acessos" description="Resumo de administracao, contas criticas e saude de acesso." icon={Building2} contentClassName="space-y-4">
            <ExecutiveSignal label="Base ativa" value={`${activeUsers}`} helper="Usuarios ativos e com acesso regular." icon={Users2} tone="blue" />
            <ExecutiveSignal label="Perfis elevados" value={`${adminUsers}`} helper="Administradores e contas de governanca." icon={ShieldCheck} tone="amber" />
            <ExecutiveSignal label="Restricoes" value={`${blockedUsers}`} helper="Usuarios com bloqueio ou necessidade de revisao." icon={AlertTriangle} tone="rose" />
          </SectionCard>
        </PageSideContent>
      </PageMainGrid>
    </div>
  );

  const renderOperational = () => (
    <div className="space-y-6">
      <PageStatsRow className="xl:grid-cols-4">
        <MetricCard title="Risco de SLA" value={`${breachedCount}`} helper="Processos com prazo vencido." icon={Timer} tone="amber" />
        <MetricCard title="Exigencias abertas" value={`${openRequirements}`} helper="Pendencias formais aguardando acao." icon={AlertTriangle} tone="rose" />
        <MetricCard title="Despachos" value={`${totalDispatches}`} helper="Fluxos intersetoriais registrados." icon={ArrowRight} tone="blue" />
        <MetricCard title="Mensagens" value={`${totalMessages}`} helper="Interacoes trocadas no universo visivel." icon={Activity} tone="default" />
      </PageStatsRow>

      <PageMainGrid className="min-[1480px]:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.95fr)]">
        <PageMainContent>
          <SectionCard title="Saude operacional detalhada" description="Risco, prazo, acao e equilibrio da operacao atual." icon={Activity} contentClassName="grid gap-4 md:grid-cols-2">
            {healthSignals.map((signal) => (
              <HealthBar key={signal.label} {...signal} />
            ))}
          </SectionCard>

          <DistributionCard title="Etapas com maior pressao" description="Concentracao atual por etapa operacional e de SLA." icon={BarChart3} data={stageChart} />
        </PageMainContent>

        <PageSideContent>
          <SectionCard title="Fila critica" description="Itens que exigem retorno, despacho ou acao taticamente imediata." icon={AlertTriangle}>
            {priorityProcesses.length === 0 ? (
              <EmptyState title="Fila sem criticidade alta" description="A operacao atual nao apresenta gargalos imediatos." icon={CheckCircle2} />
            ) : (
              <div className="space-y-3">
                {priorityProcesses.map((process) => (
                  <div key={process.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/85 p-4 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">{process.protocol}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{process.title}</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{buildPriorityReason(process)}</p>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-400">{getLatestMovementDate(process)}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </PageSideContent>
      </PageMainGrid>
    </div>
  );

  const renderCurrentSection = () => {
    if (section === "processos") return renderProcesses();
    if (section === "financeiro") return renderFinance();
    if (section === "usuarios") return renderUsers();
    if (section === "operacional") return renderOperational();
    return renderOverview();
  };

  return (
    <PortalFrame eyebrow="DASHBOARD" title="Resumo institucional">
      <PageShell>
        <PageHero eyebrow="Resumo executivo" title={headlineTitle} description={headlineDescription} icon={LayoutDashboard} actions={heroActions} />

        <InternalTabs
          items={tabs}
          value={tabs.find((tab) => tab.value === location.pathname)?.value ?? "/dashboard"}
          onChange={(value) => navigate(value)}
        />

        {renderCurrentSection()}
      </PageShell>
    </PortalFrame>
  );
}
