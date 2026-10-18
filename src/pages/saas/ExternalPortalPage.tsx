import { useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FilePlus2,
  FolderKanban,
  LineChart,
  Waypoints,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/platform/MetricCard";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { MainContent, MainGrid, PageContainer, SideContent, StatsCards } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionPanel } from "@/components/platform/SectionPanel";
import {
  buildProcessPath,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getExternallyVisibleProcessPaymentGuides,
  getVisibleProcessesByScope,
  statusLabel,
} from "@/lib/platform";
import { externalTabs, getExternalTabByPath } from "@/lib/externalTabs";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";

export function ExternalPortalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const {
    processes: allProcesses,
    getInstitutionSettings,
    loading,
    dataError,
    refreshRemoteStore,
  } = usePlatformData();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId ?? session.tenantId);
  const activeTab = getExternalTabByPath(location.pathname);

  const pendingRequirements = processes.reduce(
    (count, process) =>
      count +
      (process.requirements ?? []).filter(
        (item) =>
          item.visibility !== "interno" &&
          (item.status === "aberta" || item.status === "respondida"),
      ).length,
    0,
  );
  const concludedProcesses = processes.filter((process) =>
    ["deferido", "indeferido", "arquivado"].includes(process.status),
  ).length;
  const activeProcesses = Math.max(processes.length - concludedProcesses, 0);

  const recentActivity = useMemo(() => {
    const parseActivityMoment = (value: string | undefined) => {
      if (!value) return 0;
      const normalized = value.trim();
      const br = normalized.match(
        /^(\d{2})\/(\d{2})\/(\d{4})(?:,|\s)+(\d{2}):(\d{2})(?::(\d{2}))?/,
      );
      if (br) {
        return new Date(
          Number(br[3]),
          Number(br[2]) - 1,
          Number(br[1]),
          Number(br[4]),
          Number(br[5]),
          Number(br[6] || 0),
        ).getTime();
      }

      const parsed = new Date(normalized).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return [...processes]
      .sort(
        (a, b) =>
          parseActivityMoment(b.auditTrail?.[0]?.at ?? b.timeline?.[0]?.at) -
          parseActivityMoment(a.auditTrail?.[0]?.at ?? a.timeline?.[0]?.at),
      )
      .slice(0, 3);
  }, [processes]);

  const paymentGuides = useMemo(
    () =>
      processes.flatMap((process) =>
        getExternallyVisibleProcessPaymentGuides(process, tenantSettings).map((guide) => ({ process, guide })),
      ),
    [processes, tenantSettings],
  );
  const pendingGuides = paymentGuides.filter(
    (item) => item.guide.status !== "compensada",
  );
  const pendingPayments = pendingGuides.length;

  return (
    <PortalFrame eyebrow="Acesso Externo" title="Painel do profissional">
      <PageContainer>
        <PageIntro
          eyebrow="Resumo"
          title="O que precisa da sua atenção"
          description="Um resumo curto dos seus processos. Os detalhes ficam nas áreas de controle, pagamentos e histórico."
          icon={LineChart}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
                <Link to="/externo/protocolar">
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Novo protocolo
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100">
                <Link to="/externo/habite-se">
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  Solicitar Habite-se
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/externo/controle">
                  <FolderKanban className="mr-2 h-4 w-4" />
                  Controle de processos
                </Link>
              </Button>
            </div>
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

        {dataError ? (
          <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">Não foi possível atualizar o painel agora.</p>
                <p className="mt-1 text-xs text-rose-700">
                  Seus processos continuam preservados. A sincronização pode ser refeita sem perder dados.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-rose-200 bg-white text-rose-800 hover:bg-rose-100"
                onClick={() => void refreshRemoteStore()}
              >
                Tentar novamente
              </Button>
            </div>
          </div>
        ) : null}

        {loading && allProcesses.length === 0 ? (
          <div
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Carregando dashboard do profissional"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-[112px] animate-pulse rounded-[22px] border border-slate-200 bg-white/90 shadow-sm"
              />
            ))}
          </div>
        ) : null}

        <StatsCards>
          <MetricCard title="Em andamento" value={String(activeProcesses)} helper="Protocolos ativos" icon={Waypoints} tone="blue" />
          <MetricCard title="Exigências abertas" value={String(pendingRequirements)} helper="Pendências com retorno" icon={AlertCircle} tone="amber" />
          <MetricCard title="Pagamentos pendentes" value={String(pendingPayments)} helper="Guias aguardando compensação" icon={CreditCard} tone="rose" />
          <MetricCard title="Concluídos" value={String(concludedProcesses)} helper="Processos finalizados" icon={CheckCircle2} tone="emerald" />
        </StatsCards>

        <MainGrid>
          <MainContent>
            <SectionPanel
              title="Prioridades agora"
              description="Somente itens que merecem ação imediata."
              contentClassName="space-y-3"
            >
              {recentActivity.length === 0 ? (
                <div className="sig-dark-panel rounded-[12px] border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                  Nenhum processo em acompanhamento no momento.
                </div>
              ) : (
                recentActivity.map((process) => (
                  <div key={process.id} className="flex flex-col gap-3 rounded-[12px] border border-[#E5E7EB] bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{formatOfficialProcessNumber(process.protocol)}</p>
                      <p className="mt-1 line-clamp-1 text-sm text-slate-600">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{statusLabel(process.status)}</p>
                    </div>
                    <Button asChild variant="outline" className="shrink-0 rounded-full">
                      <Link to={buildProcessPath(process)}>Abrir processo</Link>
                    </Button>
                  </div>
                ))
              )}
            </SectionPanel>
          </MainContent>

          <SideContent>
            <SectionPanel
              title="Pendências"
              description="O que ainda depende de você."
              contentClassName="space-y-3"
            >
              <div className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Exigências abertas</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{pendingRequirements}</p>
              </div>
              <div className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Guias pendentes</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{pendingGuides.length}</p>
              </div>
            </SectionPanel>

            <SectionPanel
              title="Ações rápidas"
              description="Acesse diretamente o que precisa fazer."
              contentClassName="space-y-2"
            >
              <Button asChild className="sig-force-dark-action w-full justify-start rounded-2xl bg-slate-950 !text-white hover:bg-slate-900">
                <Link to="/externo/protocolar">
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Novo protocolo
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100">
                <Link to="/externo/habite-se">
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  Novo protocolo de Habite-se
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl">
                <Link to="/externo/controle">
                  <FolderKanban className="mr-2 h-4 w-4" />
                  Controle de processos
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl">
                <Link to="/externo/pagamentos">
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pagamentos
                </Link>
              </Button>
            </SectionPanel>
          </SideContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
  );
}
