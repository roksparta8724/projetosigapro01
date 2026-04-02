import { useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  FilePlus2,
  FolderKanban,
  History,
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
  formatCurrency,
  getProcessPaymentGuides,
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
  const { processes: allProcesses, getInstitutionSettings, getUserProfile } = usePlatformData();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId ?? session.tenantId);
  const profile = getUserProfile(session.id, session.email);
  const activeTab = getExternalTabByPath(location.pathname);

  const pendingRequirements = processes.reduce(
    (count, process) => count + (process.requirements ?? []).filter((item) => item.status === "aberta" || item.status === "respondida").length,
    0,
  );
  const pendingPayments = processes.filter((process) => process.payment?.status === "pendente").length;
  const concludedProcesses = processes.filter((process) => process.status === "aprovado" || process.status === "concluido").length;
  const activeProcesses = Math.max(processes.length - concludedProcesses, 0);

  const recentActivity = useMemo(
    () =>
      [...processes]
        .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
        .slice(0, 3),
    [processes],
  );

  const paymentGuides = useMemo(
    () =>
      processes.flatMap((process) =>
        getProcessPaymentGuides(process, tenantSettings).map((guide) => ({ process, guide })),
      ),
    [processes, tenantSettings],
  );
  const pendingGuides = paymentGuides.filter((item) => item.guide.status !== "compensada");

  return (
    <PortalFrame eyebrow="Acesso Externo" title="Painel do profissional">
      <PageContainer>
        <PageIntro
          eyebrow="Visão geral"
          title="Protocolos, pendências e pagamentos em um só lugar"
          description="Acompanhe o andamento das etapas, organize respostas e avance com clareza."
          icon={LineChart}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
                <Link to="/externo/protocolar">
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Novo protocolo
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

        <StatsCards>
          <MetricCard title="Em andamento" value={String(activeProcesses)} helper="Protocolos ativos" icon={Waypoints} tone="blue" />
          <MetricCard title="Exigências abertas" value={String(pendingRequirements)} helper="Pendências com retorno" icon={AlertCircle} tone="amber" />
          <MetricCard title="Pagamentos pendentes" value={String(pendingPayments)} helper="Guias aguardando compensação" icon={CreditCard} tone="rose" />
          <MetricCard title="Concluídos" value={String(concludedProcesses)} helper="Processos finalizados" icon={CheckCircle2} tone="emerald" />
        </StatsCards>

        <MainGrid>
          <MainContent>
            <SectionPanel
              title="Acompanhamento executivo"
              description="Visão rápida do que exige atenção imediata."
              contentClassName="space-y-4"
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="sig-dark-panel rounded-[12px] border border-[#E5E7EB] p-4 shadow-sm">
                  <p className="sig-label">Protocolos prioritários</p>
                  {recentActivity.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">Nenhuma movimentação recente encontrada.</p>
                  ) : (
                    recentActivity.map((process) => (
                      <div key={process.id} className="mt-3 rounded-[10px] border border-slate-200/80 bg-white/60 p-3">
                        <p className="text-sm font-semibold text-slate-900">{process.protocol}</p>
                        <p className="mt-1 text-sm text-slate-600">{process.title}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                          {statusLabel(process.status)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="sig-dark-panel rounded-[12px] border border-[#E5E7EB] p-4 shadow-sm">
                  <p className="sig-label">Guias pendentes</p>
                  {pendingGuides.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">Nenhuma guia pendente no momento.</p>
                  ) : (
                    pendingGuides.slice(0, 3).map(({ process, guide }) => (
                      <div key={`${process.id}-${guide.code}`} className="mt-3 rounded-[10px] border border-slate-200/80 bg-white/60 p-3">
                        <p className="text-sm font-semibold text-slate-900">{process.protocol}</p>
                        <p className="mt-1 text-sm text-slate-600">Guia {guide.code}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-rose-500">
                          {formatCurrency(guide.amount)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </SectionPanel>
          </MainContent>

          <SideContent>
            <SectionPanel
              title="Pendências do profissional"
              description="Exigências abertas e retornos aguardando resposta."
              contentClassName="space-y-3"
            >
              {pendingRequirements === 0 ? (
                <div className="sig-dark-panel rounded-[10px] border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  Nenhuma pendência aberta no momento.
                </div>
              ) : (
                processes
                  .filter((process) => (process.requirements ?? []).length > 0)
                  .slice(0, 3)
                  .map((process) => (
                    <div key={process.id} className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4 text-sm">
                      <p className="text-sm font-semibold text-slate-900">{process.protocol}</p>
                      <p className="mt-1 text-sm text-slate-600">{process.title}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">
                        Exigência pendente
                      </p>
                    </div>
                  ))
              )}
            </SectionPanel>

            <SectionPanel
              title="Ações rápidas"
              description="Atalhos úteis para o dia a dia do profissional."
              contentClassName="space-y-3"
            >
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
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl">
                <Link to="/externo/historico">
                  <History className="mr-2 h-4 w-4" />
                  Histórico
                </Link>
              </Button>
            </SectionPanel>

            <SectionPanel
              title="Resumo do acesso"
              description="Dados essenciais do seu perfil profissional."
              contentClassName="space-y-2 text-sm text-slate-700"
            >
              <div className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Responsável técnico</p>
                <p className="mt-1 font-semibold text-slate-900">{profile?.fullName || session.name}</p>
              </div>
              <div className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Registro profissional</p>
                <p className="mt-1 font-semibold text-slate-900">{profile?.registrationNumber || "Atualize em Meu Perfil"}</p>
              </div>
              <div className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Secretaria responsável</p>
                <p className="mt-1 font-semibold text-slate-900">{tenantSettings?.secretariaResponsavel || "Não configurada"}</p>
              </div>
            </SectionPanel>
          </SideContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
  );
}
